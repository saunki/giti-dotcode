// Sidewall callouts: where each piece of lettering sits on the outer (+X) sidewall, and
// the copy that unfolds from it.
//
// theta: degrees around the axle in the wheel's own frame, measured from +Z (forward)
// towards +Y (up); r: metres from the axle. Measured from the GLB's "Texts" mesh
// and the moulded lettering in "Tire.Side2" (Giti logo, GitiSport S2, the big size).
//
// COPY IS PLACEHOLDER: facts follow the lettering on the model and the standard
// sidewall conventions; brand/series claims need checking with Giti before launch.

export const CALLOUTS = [
  {
    id: 'brand',
    label: 'Giti',
    tag: 'The brand',
    theta: 101,
    r: 0.342,
    title: 'Giti Tire',
    lead: 'A global tire maker with roots going back to 1951.',
    body: [
      'Giti designs and builds passenger, SUV and truck tires sold in more than 130 countries.',
      'Development runs through engineering centres in Europe, Asia and North America; the sidewall’s “German Engineering” refers to the European R&D centre where this range was tuned.',
      'The elephant mark stands for strength, reliability and a long memory: qualities a tire needs too.',
    ],
  },
  {
    id: 'load',
    label: 'Max load',
    tag: '950 kg · 340 kPa',
    theta: 132,
    r: 0.316,
    title: 'Max load & pressure',
    lead: 'MAX LOAD 950 kg (2094 lbs) · 340 kPa (50 psi) MAX PRESS',
    body: [
      'The heaviest load one tire may carry, reached only at the maximum inflation pressure.',
      '340 kPa is the ceiling the tire is built to hold, not a pressure to drive on. Use the pressure on your car’s door-jamb placard.',
      'Four tires × 950 kg gives a comfortable margin over the axle loads of most performance cars and SUVs.',
    ],
  },
  {
    id: 'outside',
    label: 'Outside',
    tag: 'Mounting direction',
    theta: 169,
    r: 0.352,
    title: 'Mount this side out',
    lead: 'An asymmetric tread: each half of the tire does a different job.',
    body: [
      'Outer shoulder: big, stiff blocks for grip and steering precision in hard cornering.',
      'Inner half: more grooves and sipes to clear water and resist aquaplaning.',
      '“OUTSIDE” must face away from the car. The tire can go on either side of the vehicle; only this face matters.',
    ],
    steps: ['Find “OUTSIDE” on the sidewall', 'Face it away from the car', 'Balance and torque the wheel'],
  },
  {
    id: 'series',
    label: 'GitiSport S2',
    tag: 'The series',
    theta: 226,
    r: 0.355,
    title: 'GitiSport S2',
    lead: 'Ultra-high-performance summer tire for sports cars and fast SUVs.',
    body: [
      'Built for dry grip and steering response first, with a wet-optimised compound so it stays composed in the rain.',
      'Offered in 18″–22″ fitments with Y-rated (300 km/h) speed capability.',
    ],
  },
  {
    id: 'size',
    label: '275/40 R20',
    tag: 'Tire size',
    theta: 352,
    r: 0.347,
    title: 'Reading the size',
    lead: '275/40 R20 106Y XL',
    code: [
      ['275', 'Width', 'Section width in millimetres'],
      ['40', 'Profile', 'Sidewall height = 40 % of width (110 mm)'],
      ['R', 'Radial', 'Radial-ply construction'],
      ['20', 'Rim', 'Fits a 20-inch wheel'],
      ['106', 'Load index', '950 kg per tire'],
      ['Y', 'Speed', 'Up to 300 km/h'],
    ],
    body: ['XL (Extra Load): a reinforced carcass rated for more load at higher pressure than a standard tire of the same size.'],
  },
  {
    id: 'dot',
    label: 'DOT 19U P2M7A0',
    tag: 'DOT code',
    theta: 72,
    r: 0.314,
    title: 'The DOT code',
    lead: 'The tire’s ID: who made it, where, and when.',
    code: [
      ['DOT', 'Standard', 'Meets US Department of Transportation safety rules'],
      ['19U', 'Plant', 'The factory that built this tire'],
      ['P2M7A0', 'Maker’s code', 'Size and construction batch'],
      ['WWYY', 'Date', 'Week and year it was made, e.g. 2425 = week 24 of 2025'],
    ],
    body: ['Check the date code when buying: tires age even in storage. Most makers advise replacing tires older than 6–10 years.'],
  },
]

// Scroll sections: the hero, then one per callout, ordered so the wheel only ever
// rolls forward while scrolling down (backwards when scrolling up).
export const SECTIONS = [
  { id: 'hero', kicker: 'GitiSport S2', title: 'Read the tire', text: 'Scroll to roll it. Every mark on the sidewall tells you something.' },
  ...['brand', 'load', 'outside', 'series', 'size', 'dot'].map((id) => {
    const c = CALLOUTS.find((x) => x.id === id)
    return { id, focus: id, kicker: c.tag, title: c.label, text: c.lead }
  }),
]

export const MENU = ['Tires', 'Technology', 'Tire guide', 'Motorsport', 'About Giti']
