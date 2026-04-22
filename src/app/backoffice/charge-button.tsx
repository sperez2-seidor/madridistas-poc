"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type ChargeButtonProps = {
  leadId: string;
  amountLabel: string;
};

type ChargeResult =
  | { ok: true; paymentIntentId: string; status: string }
  | { ok: false; error: string; code?: string; paymentIntentId?: string | null };

export default function ChargeButton({ leadId, amountLabel }: ChargeButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<ChargeResult | null>(null);

  const busy = isLoading || isPending;

  const handleClick = async () => {
    setResult(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/backoffice/charge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId }),
      });
      const data = (await response.json()) as ChargeResult;
      setResult(data);
      startTransition(() => router.refresh());
    } catch (error) {
      setResult({
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "No se pudo ejecutar el cobro.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="charge-action">
      <button
        type="button"
        className="flow-action"
        onClick={handleClick}
        disabled={busy}
      >
        {busy ? "Procesando…" : `Ejecutar cobro (${amountLabel})`}
      </button>
      {result ? (
        <p
          className={`charge-feedback ${
            result.ok ? "charge-feedback-ok" : "charge-feedback-ko"
          }`}
        >
          {result.ok
            ? `Cobro ${result.status} · ${result.paymentIntentId}`
            : `Error: ${result.error}`}
        </p>
      ) : null}
    </div>
  );
}
