import heroImage from "./landing-images.json";

/**
 * Static content for the marketing site. Image paths come from the generated
 * manifest (`public/images/CREDITS.md` lists sources and licences).
 */
const IMG = heroImage as {
  hero: { src: string; title: string }[];
  parks: { src: string; title: string }[];
  attractions: { src: string; title: string }[];
};

export const HERO_IMAGE = IMG.hero[0]?.src ?? "/images/hero/savannah-sunset-acacia-africa.jpg";

function img(list: { src: string }[], index: number) {
  return list[index % Math.max(list.length, 1)]?.src ?? "";
}

export interface Park {
  name: string;
  region: string;
  description: string;
  image: string;
}

export const PARKS: Park[] = [
  { name: "Maasai Mara", region: "Narok, Kenya", description: "Big cats, river crossings and the Great Migration.", image: img(IMG.parks, 0) },
  { name: "Amboseli", region: "Kajiado, Kenya", description: "Elephants against the snows of Kilimanjaro.", image: img(IMG.parks, 1) },
  { name: "Tsavo East", region: "Coast, Kenya", description: "Red-dust plains and the Galana River.", image: img(IMG.parks, 2) },
  { name: "Tsavo West", region: "Coast, Kenya", description: "Lava fields, springs and rhino sanctuaries.", image: img(IMG.parks, 3) },
  { name: "Samburu", region: "Rift Valley, Kenya", description: "Northern specials: Grevy's zebra and reticulated giraffe.", image: img(IMG.parks, 4) },
  { name: "Lake Nakuru", region: "Rift Valley, Kenya", description: "Flamingo fringes and endangered white rhino.", image: img(IMG.parks, 5) },
  { name: "Nairobi National Park", region: "Nairobi, Kenya", description: "A wildlife park on the city skyline.", image: img(IMG.parks, 6) },
  { name: "Serengeti", region: "Tanzania", description: "Endless plains at the heart of the migration.", image: img(IMG.parks, 7) },
  { name: "Ngorongoro", region: "Arusha, Tanzania", description: "A crater full of lions and 20,000 animals.", image: img(IMG.parks, 8) },
];

export interface Attraction {
  name: string;
  detail: string;
  image: string;
}

export const ATTRACTIONS: Attraction[] = [
  { name: "Great Migration", detail: "River crossings July to October.", image: img(IMG.attractions, 0) },
  { name: "Diani Beach", detail: "White sand and coral reef on the South Coast.", image: img(IMG.attractions, 1) },
  { name: "Lamu Old Town", detail: "Swahili architecture and dhow life.", image: img(IMG.attractions, 2) },
  { name: "Mount Kenya", detail: "Glacial peaks and alpine forest trails.", image: img(IMG.attractions, 3) },
  { name: "Hell's Gate", detail: "Walk or cycle among the gorges.", image: img(IMG.attractions, 4) },
  { name: "Giraffe Centre", detail: "Feed endangered Rothschild giraffes.", image: img(IMG.attractions, 5) },
  { name: "Sheldrick Elephant Orphanage", detail: "Orphans fostered back to the wild.", image: img(IMG.attractions, 6) },
  { name: "Fort Jesus", detail: "Mombasa's 16th-century sea fort.", image: img(IMG.attractions, 7) },
  { name: "Lake Naivasha", detail: "Boat hippos and crescent island wildlife.", image: img(IMG.attractions, 8) },
  { name: "Stone Town", detail: "Zanzibar's spice-island old quarter.", image: img(IMG.attractions, 9) },
];

export const STATS = [
  { value: 18400, suffix: "+", label: "Trips run" },
  { value: 96, suffix: "%", label: "Deposits auto-reconciled" },
  { value: 9, suffix: "", label: "Parks covered" },
  { value: 48, suffix: "", label: "Minutes to dispatch" },
];

export const STEPS = [
  {
    title: "Book",
    body: "Guests dial USSD, text SMS or book on the web. One record is created for every trip.",
  },
  {
    title: "Quote & pay",
    body: "The rate engine prices park fees, transport, season and margin in seconds, then pushes M-Pesa STK.",
  },
  {
    title: "Dispatch",
    body: "Assign a driver and vehicle. Overlaps are rejected by the database and drivers reply YES or NO.",
  },
  {
    title: "Explore safely",
    body: "Itinerary and concierge by SMS, safety alerts by SMS and Voice, feedback and airtime rewards after.",
  },
];

export const TESTIMONIALS = [
  {
    quote: "Quotes that used to take an afternoon now take a minute. Double allocation is gone.",
    name: "Amina Otieno",
    role: "Owner, Mara Day Safaris",
  },
  {
    quote: "The driver answers on SMS and the dashboard moves by itself. I stopped chasing payments.",
    name: "Peter Kamau",
    role: "Operations, Amboseli Shuttles",
  },
  {
    quote: "Road closures reach our guests before they leave the lodge. That is peace of mind.",
    name: "Lucy Njeri",
    role: "Manager, Nakuru Guesthouse",
  },
];

export const PRICING = [
  {
    name: "Starter",
    price: "KES 2,500",
    period: "/month",
    features: ["Web, USSD and SMS booking", "M-Pesa deposits and receipts", "SMS dispatch and driver replies"],
    cta: "Start with Starter",
  },
  {
    name: "Pro",
    price: "KES 6,000",
    period: "/month",
    features: ["Everything in Starter", "Voice IVR and alert calls", "AI drafting, concierge and itinerary", "Analytics, loyalty and audit log"],
    cta: "Go Pro",
    highlight: true,
  },
];

export const FAQ = [
  {
    q: "Does my team need smartphones?",
    a: "No. Booking, payments, dispatch and alerts all work over USSD, SMS and Voice. The dashboard is optional.",
  },
  {
    q: "How are M-Pesa deposits matched to bookings?",
    a: "Each charge carries a unique reference. The Paystack webhook marks the payment SUCCESS and reconciliation flags anything unmatched or off by amount.",
  },
  {
    q: "What happens when the internet drops?",
    a: "USSD and SMS sessions are stateless, so guests keep booking. Missed webhooks are swept automatically once connectivity returns.",
  },
  {
    q: "Is data kept safe?",
    a: "Phone numbers are masked in logs and prompts, secrets live in environment variables, and AI output is validated before it is used.",
  },
];
