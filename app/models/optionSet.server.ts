import type { OptionSet, Prisma, SetStatus } from "@prisma/client";
import {
  AssignmentSchema,
  OptionSetDraftSchema,
  emptyDraft,
  validateOptionSet,
  type Assignment,
  type OptionSetDraft,
  type ProductConfig,
} from "@personalizer/contract";
import prisma from "../db.server";
import { NotFoundError, PublishValidationError } from "./errors";

/** An OptionSet row with its JSON columns parsed into contract types. */
export type OptionSetRecord = Omit<OptionSet, "draft" | "assignment"> & {
  draft: OptionSetDraft;
  assignment: Assignment;
};

export type OptionSetSummary = Pick<
  OptionSet,
  "id" | "name" | "status" | "version" | "publishedAt" | "createdAt" | "updatedAt"
>;

function toRecord(row: OptionSet): OptionSetRecord {
  return {
    ...row,
    draft: OptionSetDraftSchema.parse(row.draft),
    assignment: AssignmentSchema.parse(row.assignment),
  };
}

// Every function takes `shopId` and filters by it: rows of other shops are never visible.

export async function createOptionSet(
  shopId: string,
  input: { name: string; draft?: OptionSetDraft; assignment?: Assignment },
): Promise<OptionSetRecord> {
  const draft = OptionSetDraftSchema.parse(input.draft ?? emptyDraft());
  const assignment = AssignmentSchema.parse(input.assignment ?? {});
  const row = await prisma.optionSet.create({
    data: {
      shopId,
      name: requireName(input.name),
      draft: draft as Prisma.InputJsonValue,
      assignment: assignment as Prisma.InputJsonValue,
    },
  });
  return toRecord(row);
}

export async function getOptionSet(shopId: string, id: string): Promise<OptionSetRecord | null> {
  const row = await prisma.optionSet.findFirst({ where: { id, shopId } });
  return row ? toRecord(row) : null;
}

/** Light list for admin screens: no draft JSON loaded. */
export function listOptionSets(
  shopId: string,
  opts: { status?: SetStatus; take?: number; skip?: number } = {},
): Promise<OptionSetSummary[]> {
  return prisma.optionSet.findMany({
    where: { shopId, ...(opts.status ? { status: opts.status } : {}) },
    select: { id: true, name: true, status: true, version: true, publishedAt: true, createdAt: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: opts.take ?? 50,
    skip: opts.skip ?? 0,
  });
}

export async function updateOptionSet(
  shopId: string,
  id: string,
  patch: { name?: string; draft?: OptionSetDraft; assignment?: Assignment },
): Promise<OptionSetRecord> {
  const data: Prisma.OptionSetUpdateManyMutationInput = {};
  if (patch.name !== undefined) data.name = requireName(patch.name);
  if (patch.draft !== undefined) data.draft = OptionSetDraftSchema.parse(patch.draft) as Prisma.InputJsonValue;
  if (patch.assignment !== undefined) data.assignment = AssignmentSchema.parse(patch.assignment) as Prisma.InputJsonValue;

  // updateMany so the shopId filter applies to the write itself.
  const { count } = await prisma.optionSet.updateMany({ where: { id, shopId }, data });
  if (count === 0) throw new NotFoundError("OptionSet");
  const updated = await getOptionSet(shopId, id);
  if (!updated) throw new NotFoundError("OptionSet");
  return updated;
}

/**
 * Publish (partial). Runs `validateOptionSet`, then snapshots the draft as an immutable
 * OptionSetVersion and bumps `version`. Throws PublishValidationError and writes nothing if invalid.
 * Still to come:
 *   - ProductAssignment rebuild + product metafield writes         -> T07
 *   - fee variant mapping in `pricing.feeVariantMap`               -> T17
 *     (until the shop has a fee product, sets that charge extra cannot be published)
 */
export async function publishOptionSet(
  shopId: string,
  id: string,
): Promise<{ optionSet: OptionSetRecord; config: ProductConfig }> {
  return prisma.$transaction(async (tx) => {
    const row = await tx.optionSet.findFirst({ where: { id, shopId }, include: { shop: true } });
    if (!row) throw new NotFoundError("OptionSet");

    const draft = OptionSetDraftSchema.parse(row.draft);
    const shopFonts = await tx.font.findMany({ where: { shopId } });
    const issues = validateOptionSet(draft, {
      knownFontIds: new Set(shopFonts.map((f) => f.id)),
      feeMappingAvailable: Boolean(row.shop.feeProductId),
    });
    if (issues.length > 0) throw new PublishValidationError(issues);

    const last = await tx.optionSetVersion.findFirst({
      where: { optionSetId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const version = (last?.version ?? 0) + 1;

    // Fonts referenced by font options, so old orders can still render after edits.
    const usedFontIds = new Set(
      draft.options.flatMap((o) => (o.type === "font" ? o.values.flatMap((v) => (v.fontId ? [v.fontId] : [])) : [])),
    );
    const fonts = shopFonts.filter((f) => usedFontIds.has(f.id));

    const config: ProductConfig = {
      ...draft,
      optionSetId: id,
      version,
      currency: row.shop.currency,
      fonts: fonts.map((f) => ({
        id: f.id,
        family: f.family,
        woff2Url: f.woff2Url,
        weight: f.weight,
        style: f.style,
      })),
    };

    await tx.optionSetVersion.create({
      data: { optionSetId: id, version, config: config as Prisma.InputJsonValue },
    });
    const updated = await tx.optionSet.update({
      where: { id },
      data: { status: "PUBLISHED", version, publishedAt: new Date() },
    });
    return { optionSet: toRecord(updated), config };
  });
}

function requireName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("OptionSet name is required");
  return trimmed;
}
