"use client";

import { useState } from "react";

type UpdateCardButtonProps = {
  customerId: string;
};

export default function UpdateCardButton({ customerId }: UpdateCardButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(
        "/api/backoffice/update-payment-method",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ customerId }),
        },
      );
      const data = (await response.json()) as
        | { ok: true; url: string }
        | { ok?: false; error: string };

      if ("url" in data && data.url) {
        window.location.href = data.url;
        return;
      }

      setError("error" in data ? data.error : "No se pudo iniciar el cambio.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo iniciar el cambio de tarjeta.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="charge-action">
      <button
        type="button"
        className="text-button"
        onClick={handleClick}
        disabled={isLoading}
      >
        {isLoading ? "Abriendo Stripe…" : "Cambiar tarjeta"}
      </button>
      {error ? (
        <p className="charge-feedback charge-feedback-ko">{error}</p>
      ) : null}
    </div>
  );
}
