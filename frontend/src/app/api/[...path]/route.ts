import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

async function proxy(req: NextRequest, path: string[]): Promise<NextResponse> {
  const target = `${BACKEND_URL}/api/${path.join("/")}${req.nextUrl.search}`;
  const init: RequestInit = {
    method: req.method,
    headers: {
      "content-type": req.headers.get("content-type") ?? "application/json",
      cookie: req.headers.get("cookie") ?? "",
    },
    body: ["GET", "HEAD"].includes(req.method) ? undefined : await req.text(),
  };

  const upstream = await fetch(target, init);
  const body = await upstream.text();
  const res = new NextResponse(body, { status: upstream.status });
  res.headers.set("content-type", upstream.headers.get("content-type") ?? "application/json");

  const setCookie = upstream.headers.get("set-cookie");
  if (setCookie) {
    res.headers.set("set-cookie", setCookie);
  }
  return res;
}

type Params = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, { params }: Params) {
  return proxy(req, (await params).path);
}
export async function POST(req: NextRequest, { params }: Params) {
  return proxy(req, (await params).path);
}
export async function PATCH(req: NextRequest, { params }: Params) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: NextRequest, { params }: Params) {
  return proxy(req, (await params).path);
}
