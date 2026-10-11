/**
 * Demo merchant catalogs, adapted from Borneo's sample stores
 * (github.com/itzsihui/Borneo, src/lib/market/sample-stores.ts) with realistic USD prices.
 * Each store gets its own Solana wallet when the demo world is prepared.
 */
export type Sku = { id: string; title: string; description: string; usd: number };
export type Store = { slug: string; name: string; skus: Sku[] };

export const STORES: Store[] = [
  {
    "slug": "island-linen",
    "name": "Island Linen Co",
    "skus": [
      {
        "id": "linen-camp-shirt-sand",
        "title": "Linen Camp Shirt / Sand / M",
        "description": "Breathable short-sleeve camp collar for humid days",
        "usd": 119
      },
      {
        "id": "linen-camp-shirt-white",
        "title": "Linen Camp Shirt / White / L",
        "description": "Crisp white linen, relaxed tropical fit",
        "usd": 139
      },
      {
        "id": "breezy-tank-ivory",
        "title": "Breezy Tank / Ivory / S",
        "description": "Lightweight scoop tank for island heat",
        "usd": 48
      },
      {
        "id": "breezy-tank-sage",
        "title": "Breezy Tank / Sage / M",
        "description": "Soft sage tank, everyday summer layer",
        "usd": 48
      },
      {
        "id": "resort-midi-dress",
        "title": "Resort Midi Dress / Coral / M",
        "description": "Sleeveless midi dress for day-to-evening heat",
        "usd": 168
      },
      {
        "id": "wrap-sundress-sky",
        "title": "Wrap Sundress / Sky / S",
        "description": "Light wrap sundress, airy cotton blend",
        "usd": 168
      },
      {
        "id": "tailored-short-khaki",
        "title": "Tailored Short / Khaki / 30",
        "description": "Knee-length chino short for tropical offices",
        "usd": 85
      },
      {
        "id": "tailored-short-navy",
        "title": "Tailored Short / Navy / 32",
        "description": "Navy tailored short, mid rise",
        "usd": 85
      },
      {
        "id": "wide-linen-pant",
        "title": "Wide Linen Pant / Natural / M",
        "description": "Flowing linen pant for humid evenings",
        "usd": 128
      },
      {
        "id": "crop-tee-palm",
        "title": "Crop Tee / Palm Print / M",
        "description": "Soft jersey crop with subtle palm motif",
        "usd": 42
      },
      {
        "id": "poplin-shirt-dress",
        "title": "Poplin Shirt Dress / White / M",
        "description": "Crisp shirt dress, sleeves rolled for summer",
        "usd": 168
      },
      {
        "id": "rib-henley-sand",
        "title": "Rib Henley / Sand / L",
        "description": "Light rib henley for AC-to-outdoor days",
        "usd": 58
      }
    ]
  },
  {
    "slug": "tropic-step",
    "name": "Tropic Step",
    "skus": [
      {
        "id": "knit-ballet-flat-black",
        "title": "Knit Ballet Flat / Black / 8",
        "description": "Washable knit ballet flat \u2014 all-day city comfort",
        "usd": 98
      },
      {
        "id": "knit-ballet-flat-nude",
        "title": "Knit Ballet Flat / Nude / 7",
        "description": "Nude knit flat for humid office days",
        "usd": 98
      },
      {
        "id": "pointed-flat-ivory",
        "title": "Pointed Flat / Ivory / 8",
        "description": "Pointed-toe flat with flexible knit upper",
        "usd": 98
      },
      {
        "id": "slingback-flat-tan",
        "title": "Slingback Flat / Tan / 9",
        "description": "Open-heel slingback for tropical evenings",
        "usd": 98
      },
      {
        "id": "mary-jane-flat-black",
        "title": "Mary Jane Flat / Black / 8",
        "description": "Buckle Mary Jane flat, soft knit",
        "usd": 98
      },
      {
        "id": "strappy-sandal-gold",
        "title": "Strappy Sandal / Gold / 7",
        "description": "Light strappy sandal for summer nights",
        "usd": 88
      },
      {
        "id": "slide-sandal-white",
        "title": "Slide Sandal / White / 8",
        "description": "Easy pool-to-street slide",
        "usd": 88
      },
      {
        "id": "mesh-sneaker-sky",
        "title": "Mesh Sneaker / Sky / 9",
        "description": "Breathable mesh runner for humid walks",
        "usd": 110
      },
      {
        "id": "canvas-espadrille",
        "title": "Canvas Espadrille / Natural / 8",
        "description": "Rope-sole espadrille for weekend brunch",
        "usd": 115
      },
      {
        "id": "wide-knit-flat",
        "title": "Wide Knit Flat / Black / 9 Wide",
        "description": "Wide-width knit flat for all-day wear",
        "usd": 98
      }
    ]
  },
  {
    "slug": "linjer-light",
    "name": "Linjer Light",
    "skus": [
      {
        "id": "slim-chain-necklace",
        "title": "Slim Chain Necklace / Gold / 18in",
        "description": "Minimal gold-tone chain for everyday layering",
        "usd": 72
      },
      {
        "id": "pearl-drop-earrings",
        "title": "Pearl Drop Earrings / Ivory / OS",
        "description": "Lightweight pearl drops for humid evenings",
        "usd": 54
      },
      {
        "id": "hoop-earrings-small",
        "title": "Small Hoop Earrings / Gold / OS",
        "description": "Everyday gold-tone hoops",
        "usd": 54
      },
      {
        "id": "stack-ring-set",
        "title": "Stack Ring Set / Silver / 7",
        "description": "Three thin stackable rings",
        "usd": 48
      },
      {
        "id": "cuff-bracelet",
        "title": "Open Cuff Bracelet / Gold / OS",
        "description": "Sculptural open cuff, polished finish",
        "usd": 64
      },
      {
        "id": "tennis-bracelet",
        "title": "Tennis Bracelet / Silver / OS",
        "description": "Delicate tennis-style bracelet",
        "usd": 64
      },
      {
        "id": "pendant-necklace",
        "title": "Disc Pendant Necklace / Gold / 16in",
        "description": "Minimal disc pendant on fine chain",
        "usd": 72
      },
      {
        "id": "stud-earrings-crystal",
        "title": "Crystal Stud Earrings / Clear / OS",
        "description": "Tiny crystal studs for daily wear",
        "usd": 54
      },
      {
        "id": "anklet-chain",
        "title": "Summer Anklet / Gold / OS",
        "description": "Fine anklet chain for sandals season",
        "usd": 32
      },
      {
        "id": "ear-cuff-set",
        "title": "Ear Cuff Set / Gold / OS",
        "description": "No-pierce ear cuff trio",
        "usd": 40
      }
    ]
  },
  {
    "slug": "canopy-wear",
    "name": "Canopy Wear",
    "skus": [
      {
        "id": "treeblend-tee-forest",
        "title": "Treeblend Tee / Forest / M",
        "description": "Soft sustainable tee \u2014 plants trees with every purchase vibe",
        "usd": 42
      },
      {
        "id": "treeblend-tee-ocean",
        "title": "Treeblend Tee / Ocean / L",
        "description": "Ocean blue everyday tee for hot weather",
        "usd": 42
      },
      {
        "id": "oversized-shirt-white",
        "title": "Oversized Shirt / White / M",
        "description": "Breathable oversized shirt for sun cover",
        "usd": 119
      },
      {
        "id": "jogger-short-olive",
        "title": "Jogger Short / Olive / M",
        "description": "Light jogger short for park days",
        "usd": 85
      },
      {
        "id": "packable-hat-khaki",
        "title": "Packable Hat / Khaki / OSFA",
        "description": "Crushable sun hat for travel",
        "usd": 45
      },
      {
        "id": "bucket-hat-sage",
        "title": "Bucket Hat / Sage / OSFA",
        "description": "Soft bucket hat for midday shade",
        "usd": 45
      },
      {
        "id": "canvas-daypack",
        "title": "Canvas Daypack / Natural / Medium",
        "description": "Light daypack for city + trail",
        "usd": 96
      },
      {
        "id": "crossbody-mini",
        "title": "Crossbody Mini / Black / Small",
        "description": "Hands-free mini for humid nights out",
        "usd": 78
      },
      {
        "id": "aviator-shades",
        "title": "Aviator Shades / Smoke / OS",
        "description": "UV-ready metal frame sunglasses",
        "usd": 62
      },
      {
        "id": "silk-scarf-tropic",
        "title": "Silk Scarf / Tropic Print / OS",
        "description": "Lightweight scarf for AC offices",
        "usd": 58
      },
      {
        "id": "linen-shorts-ivory",
        "title": "Linen Shorts / Ivory / M",
        "description": "Drawstring linen short for weekend heat",
        "usd": 95
      },
      {
        "id": "rash-guard-navy",
        "title": "Rash Guard / Navy / M",
        "description": "UPF swim top for island weekends",
        "usd": 54
      },
      {
        "id": "beach-tote-stripe",
        "title": "Beach Tote / Stripe / Large",
        "description": "Open beach tote with interior pocket",
        "usd": 68
      }
    ]
  }
];

export function findSku(slug: string, skuId: string) {
  const store = STORES.find((s) => s.slug === slug);
  const sku = store?.skus.find((k) => k.id === skuId);
  return store && sku ? { store, sku } : null;
}
