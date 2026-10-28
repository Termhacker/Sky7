import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// This seed mirrors the current public prototype. Prices are stored as integer kobo,
// never as formatted strings, so later cart totals do not depend on parsing display text.
const categories = [
  { id: 'mains', name: 'Main Dishes', sortOrder: 1 },
  { id: 'starters', name: 'Starters', sortOrder: 2 },
  { id: 'grills', name: 'Grills', sortOrder: 3 },
  { id: 'sides', name: 'Sides', sortOrder: 4 },
  { id: 'drinks', name: 'Drinks', sortOrder: 5 },
  { id: 'desserts', name: 'Desserts', sortOrder: 6 },
];

const items = [
  ['mains','Jollof Rice','Smoky party-style rice, slow-cooked in a rich tomato and pepper base, finished over open flame.',450000,true,'Chef’s Pick'],
  ['mains','Egusi & Pounded Yam','Ground melon seed stew with spinach and palm oil, served with silky hand-pounded yam.',620000,true,null],
  ['mains','Pepper Soup','Fragrant native-spice broth with fresh catfish, scent leaf and a quiet hum of heat.',580000,true,null],
  ['mains','Ofada Rice & Ayamase','Local ofada rice with green pepper designer stew and assorted slow-cooked meats.',650000,true,null],
  ['mains','Fisherman Okra','Seafood-laden okra soup with prawns, periwinkle and crab, drawn straight from the coast.',720000,false,null],
  ['starters','Suya Skewers','Flame-grilled beef in house-ground yaji spice, with fresh onion and tomato.',380000,true,'Chef’s Pick'],
  ['starters','Prawn Toast','Golden sesame-crusted prawn toast with a chilli-lime dipping sauce.',320000,true,null],
  ['starters','Akara & Pepper Dip','Whipped bean fritters, fried to order, with a roasted red pepper dip.',250000,true,null],
  ['starters','Plantain Cups','Crisp cups of ripe plantain filled with peppered chicken and avocado crema.',290000,true,null],
  ['grills','Charcoal Chicken','Half bird marinated overnight, charred over hardwood coals, served with fried yam.',750000,true,'Chef’s Pick'],
  ['grills','Beef Asun','Smoky char-grilled beef tossed in scotch-bonnet butter and bell peppers.',680000,true,null],
  ['grills','Grilled Croaker','Whole croaker scored and grilled, brushed with garlic-palm oil and lime.',920000,true,null],
  ['grills','Lamb Chops','Tommy-rack lamb chops, charred crust, rosemary jus, smoked aubergine.',1100000,false,null],
  ['sides','Fried Plantain','Caramel-edged dodo, salted while hot. Dangerously easy to finish.',220000,true,null],
  ['sides','Coconut Rice','Fragrant rice steamed in coconut milk with sweet peppers and thyme.',300000,true,null],
  ['sides','Moin Moin','Steamed bean pudding with egg and smoked prawn, wrapped in leaf.',200000,true,null],
  ['sides','Salad of the Day','Whatever the market gave us this morning, dressed simply and well.',280000,true,null],
  ['drinks','Chapman','The classic — grenadine, citrus, bitters and a whisper of almond, over crushed ice.',250000,true,'Chef’s Pick'],
  ['drinks','Zobo Spritz','Hibiscus cold-brew shaken with ginger and lime, topped with soda.',200000,true,null],
  ['drinks','Palm Wine Cooler','Fresh palm wine over ice with a squeeze of lime. Drink it young.',300000,true,null],
  ['drinks','Ginger Beer','House-fermented, fiery and cold. Non-alcoholic, fully awake.',180000,false,null],
  ['desserts','Agege Toast','Crisped agege bread, brown-sugar butter, vanilla chantilly.',280000,true,null],
  ['desserts','Coconut Candy Parfait','Layers of coconut candy crumble, coconut cream and toasted flakes.',320000,true,null],
  ['desserts','Plantain Tarte','Caramelised plantain on crisp pastry with palm-sugar ice cream.',360000,true,'Chef’s Pick'],
].map(([categoryId, name, description, priceKobo, available, badge], index) => ({
  categoryId, name, description, priceKobo, available, badge, sortOrder: index + 1,
  slug: `${categoryId}-${name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
}));

async function main() {
  for (const category of categories) {
    await prisma.category.upsert({ where: { id: category.id }, update: { name: category.name, sortOrder: category.sortOrder }, create: category });
  }

  for (const item of items) {
    const { categoryId, ...data } = item;
    await prisma.menuItem.upsert({
      where: { slug: item.slug },
      update: { ...data, category: { connect: { id: categoryId } } },
      create: { ...data, category: { connect: { id: categoryId } } },
    });
  }

  await prisma.businessSettings.upsert({
    where: { id: 'main' },
    update: {},
    create: { id: 'main', businessName: 'SKY7', currency: 'NGN', whatsappNumber: null },
  });

  console.log(`Seeded ${categories.length} fixed categories and ${items.length} menu items.`);
}

main()
  .catch((error) => { console.error('SKY7 seed failed:', error); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
