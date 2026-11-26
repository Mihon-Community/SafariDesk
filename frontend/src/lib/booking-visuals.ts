import { ATTRACTIONS, HERO_IMAGE, PARKS } from "./landing-data";

export interface BookingVisual {
  src: string;
  alt: string;
}

/** Presentational helper: pairs a booking with an existing local safari image. */
export function bookingVisual(parkName?: string | null, packageName?: string | null): BookingVisual {
  const name = (parkName ?? packageName ?? "").toLowerCase();
  if (!name) return { src: HERO_IMAGE, alt: "Tourists on a game drive in Samburu National Reserve, Kenya" };
  const park = PARKS.find((p) => name.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(name));
  if (park) return { src: park.image, alt: `${park.name} landscape` };

  const attraction = ATTRACTIONS.find((a) => name.includes(a.name.toLowerCase()));
  if (attraction) return { src: attraction.image, alt: attraction.name };

  if (name.includes("mara") || name.includes("amboseli") || name.includes("nakuru")) {
    const match = PARKS.find((p) => name.includes(p.name.toLowerCase().split(" ")[0]!));
    if (match) return { src: match.image, alt: `${match.name} landscape` };
  }

  return {
    src: HERO_IMAGE,
    alt: "Tourists on a game drive in Samburu National Reserve, Kenya",
  };
}
