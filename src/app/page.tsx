import Image from "next/image";

const benefits = [
  "La camiseta oficial de cada temporada",
  "Un pack de bienvenida para empezar como Platinum",
  "Todas las ventajas de Madridista Premium",
];

const plans = [
  {
    cadence: "Mensual",
    price: "12,90 EUR/mes",
    copy: "Libertad para renovar mes a mes.",
  },
  {
    cadence: "Anual",
    price: "149,90 EUR/año",
    copy: "Toda la temporada con ventajas incluidas.",
  },
];

export default function Home() {
  return (
    <main className="landing">
      <section className="hero" aria-label="Madridista Platinum">
        <Image
          className="hero-image"
          src="https://images.unsplash.com/photo-1741162809835-3b7777838181?auto=format&fit=crop&w=2200&q=85"
          alt="Exterior del estadio Santiago Bernabeu"
          fill
          priority
          sizes="100vw"
        />
        <div className="hero-shade" />
        <header className="topbar" aria-label="Navegacion principal">
          <a className="brand" href="#inicio" aria-label="Madridistas">
            <Image
              className="brand-logo"
              src="/madridistas-logo-white.svg"
              alt="Madridistas"
              width={190}
              height={54}
              priority
            />
          </a>
          <nav className="topnav" aria-label="Accesos">
            <a href="#beneficios">Beneficios</a>
            <a href="#suscripcion">Únete</a>
            <span>ES</span>
          </nav>
        </header>

        <div className="hero-content" id="inicio">
          <p className="eyebrow">Madridista Platinum</p>
          <h1>La temporada empieza contigo.</h1>
          <p>
            Recibe la camiseta de la temporada, tu pack de bienvenida y todas
            las ventajas Premium.
          </p>
          <a className="primary-action" href="/alta">
            Únete ahora
          </a>
        </div>
      </section>

      <section className="intro" id="beneficios" aria-label="Beneficios">
        <div>
          <p className="eyebrow">Desde 12,90 EUR/mes</p>
          <h2>Madridista Platinum</h2>
        </div>
        <ul className="benefit-list" aria-label="Beneficios incluidos">
          {benefits.map((benefit) => (
            <li key={benefit}>{benefit}</li>
          ))}
        </ul>
      </section>

      <section className="pricing-section" id="suscripcion">
        <div className="pricing-copy">
          <p className="eyebrow">Elige tu plan</p>
          <h2>Elige cómo vivir la temporada.</h2>
          <p>
            Hazte Platinum con pago mensual o anual y recibe las ventajas que te
            acompañan desde el primer día.
          </p>
        </div>
        <div className="pricing-shell">
          <article className="plan-start-card" aria-label="Alta Madridista Platinum">
            <div className="plan-comparison">
              {plans.map((plan) => (
                <div className="plan-summary" key={plan.cadence}>
                  <span>{plan.cadence}</span>
                  <strong>{plan.price}</strong>
                  <p>{plan.copy}</p>
                </div>
              ))}
            </div>
            <div className="plan-start-copy">
              <p>
                El plan, la camiseta y los datos de envío se configuran en el
                siguiente paso.
              </p>
              <a className="plan-start-action" href="/alta">
                Configurar alta Platinum
              </a>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
