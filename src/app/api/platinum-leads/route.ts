import { NextResponse } from "next/server";
import { savePlatinumLead } from "@/lib/platinum-leads";

export async function POST(request: Request) {
  try {
    const payload = await request.json();
    const lead = await savePlatinumLead(payload);

    return NextResponse.json({ id: lead.id });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo guardar el lead.",
      },
      { status: 400 },
    );
  }
}
