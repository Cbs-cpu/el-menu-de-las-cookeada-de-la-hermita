import type { ReactNode } from "react";
import { SHELL_COLORS, type Spot } from "../../lib/db";
import { formatDistance } from "../../lib/geo";
import { requestLocation, useMyLocation } from "../../lib/location";
import { useErmita } from "../../lib/store";
import { Crab, Shell } from "../Art";
import { Icon, Stars } from "../ui";

/** Página a pantalla completa de una sección (por encima del mapa). */
export function SectionPage({
  title,
  onMenu,
  children,
}: {
  title: string;
  onMenu: () => void;
  children: ReactNode;
}) {
  return (
    <section className="section-page" aria-labelledby="section-title">
      <header className="section-head">
        <button
          type="button"
          className="icon-btn section-menu-btn"
          onClick={onMenu}
          aria-label="Abrir menú de secciones"
        >
          <Crab size={30} />
        </button>
        <h1 id="section-title">{title}</h1>
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

/** Tarjeta de una concha con portada, estrellas, distancia y acciones. */
export function SpotCard({
  spot,
  distance,
  onOpen,
  big = false,
}: {
  spot: Spot;
  distance?: number;
  onOpen: (s: Spot) => void;
  big?: boolean;
}) {
  const { media } = useErmita();
  const cover = media.find(
    (m) => m.spotId === spot.id && m.kind === "image",
  )?.url;
  const color = SHELL_COLORS[spot.shell]?.hex ?? SHELL_COLORS.naranja.hex;
  return (
    <article
      className={`spot-card ${big ? "is-big" : ""}`}
      style={{ "--shell": color } as React.CSSProperties}
    >
      <div className="spot-card-cover">
        {cover ? (
          <img src={cover} alt="" loading="lazy" />
        ) : (
          <Shell color={color} size={big ? 72 : 44} />
        )}
      </div>
      <div className="spot-card-body">
        <h3>{spot.name}</h3>
        <p className="spot-card-meta">
          {spot.rating ? (
            <span className="spot-card-rating">
              <span className="tabular">{spot.rating.toFixed(1)}</span>{" "}
              <Stars value={spot.rating} size={14} />
            </span>
          ) : (
            <span className="muted">Sin valorar</span>
          )}
          {distance !== undefined && (
            <span className="spot-card-distance tabular">
              a {formatDistance(distance)}
            </span>
          )}
        </p>
        {spot.address && <p className="spot-card-address">{spot.address}</p>}
        {big && spot.notes && <p className="spot-card-notes">{spot.notes}</p>}
      </div>
      <div className="spot-card-actions">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => onOpen(spot)}
        >
          <Icon.Pin size={16} /> Ver en el mapa
        </button>
        <a
          className="btn btn-primary"
          href={`https://www.google.com/maps/dir/?api=1&destination=${spot.lat},${spot.lng}`}
          target="_blank"
          rel="noreferrer"
        >
          <Icon.Route size={16} /> Cómo llegar
        </a>
      </div>
    </article>
  );
}

/** Pide la ubicación y muestra qué pasa si no se puede. Renderiza `children` cuando la hay. */
export function LocationGate({
  why,
  children,
}: {
  why: string;
  children: ReactNode;
}) {
  const loc = useMyLocation();
  if (loc.status === "ok") return <>{children}</>;
  return (
    <div className="section-empty">
      <Crab
        color="#3FBFAE"
        size={72}
        className={loc.status === "asking" ? "crab-walk" : undefined}
      />
      {loc.status === "denied" ? (
        <>
          <h2>No hay permiso para ver tu ubicación</h2>
          <p>
            Actívalo en los ajustes del navegador para este sitio y vuelve a
            probar.
          </p>
        </>
      ) : loc.status === "unavailable" ? (
        <>
          <h2>No se pudo saber dónde estás</h2>
          <p>
            Comprueba que la ubicación del dispositivo está encendida y vuelve a
            probar.
          </p>
        </>
      ) : (
        <>
          <h2>
            {loc.status === "asking"
              ? "Buscando dónde estás…"
              : "Hace falta tu ubicación"}
          </h2>
          <p>{why}</p>
        </>
      )}
      {loc.status !== "asking" && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={requestLocation}
        >
          <Icon.Locate size={18} /> Usar mi ubicación
        </button>
      )}
    </div>
  );
}

export function NoSpots({
  title,
  text,
  onMap,
}: {
  title: string;
  text: string;
  onMap: () => void;
}) {
  return (
    <div className="section-empty">
      <Crab color="#F2B44C" size={72} />
      <h2>{title}</h2>
      <p>{text}</p>
      <button type="button" className="btn btn-primary" onClick={onMap}>
        Ir al mapa
      </button>
    </div>
  );
}
