import { connection } from "next/server";

const PLACES = new Set([
  "city",
  "town",
  "village",
  "municipality",
  "hamlet",
  "suburb",
  "borough",
  "quarter",
  "state",
  "country",
  "county",
  "administrative",
  "locality",
  "district",
  "region",
  "province",
]);

type PhotonProps = {
  name?: string;
  city?: string;
  state?: string;
  country?: string;
  type?: string;
  osm_value?: string;
};

function label(props: PhotonProps, preferCity = false): string {
  const name = (preferCity ? props.city || props.name || "" : props.name || props.city || "").trim();
  if (!name) return "";
  const kind = (props.osm_value || props.type || "").toLowerCase();
  if (kind === "country") return name;
  const region = props.state && props.state !== name ? props.state : "";
  const country = props.country && props.country !== name && props.country !== region ? props.country : "";
  if (kind === "state" || kind === "province" || kind === "region") {
    return [name, country].filter(Boolean).join(", ");
  }
  return [name, region || country].filter(Boolean).join(", ");
}

async function photon(url: string): Promise<PhotonProps[]> {
  const response = await fetch(url, {
    headers: { "User-Agent": "ScoutRoles/0.1 (local place search)", Accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error("Place search failed.");
  const data = (await response.json()) as { features?: { properties?: PhotonProps }[] };
  return (data.features ?? []).map((feature) => feature.properties ?? {});
}

export async function GET(request: Request) {
  await connection();
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  const lat = url.searchParams.get("lat");
  const lon = url.searchParams.get("lon");

  try {
    if (lat && lon) {
      const latitude = Number(lat);
      const longitude = Number(lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return Response.json({ error: "That location is not valid." }, { status: 400 });
      }
      const rows = await photon(
        `https://photon.komoot.io/reverse?lat=${latitude}&lon=${longitude}&lang=en`,
      );
      const place = label(rows[0] ?? {}, true);
      return Response.json({ places: place ? [place] : [] });
    }

    if (query.length < 2) return Response.json({ places: [] });
    const rows = await photon(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8&lang=en`,
    );
    const places: string[] = [];
    for (const row of rows) {
      const kind = (row.osm_value || row.type || "").toLowerCase();
      if (kind && !PLACES.has(kind)) continue;
      const place = label(row);
      if (place && !places.includes(place)) places.push(place);
      if (places.length === 6) break;
    }
    return Response.json({ places });
  } catch {
    return Response.json({ error: "Could not look up places." }, { status: 502 });
  }
}
