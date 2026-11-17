import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

// Storefront URL: https://<store>/apps/personalizer/health
// Shopify forwards it to <app-url>/proxy/health with a signature that
// authenticate.public.appProxy verifies (it throws a 4xx Response if invalid).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.public.appProxy(request);
  const shop = new URL(request.url).searchParams.get("shop");
  return Response.json({ ok: true, shop });
};
