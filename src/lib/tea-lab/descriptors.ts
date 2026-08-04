export const TEA_DESCRIPTOR_CATEGORY_ORDER = [
  "Basic taste",
  "Floral",
  "Fruit",
  "Green & vegetal",
  "Sweet & baked",
  "Roasted & nutty",
  "Spice",
  "Earth, wood & mineral",
  "Mouthfeel",
  "Off-notes"
] as const;

export type TeaDescriptorCategory = typeof TEA_DESCRIPTOR_CATEGORY_ORDER[number];

export type TeaDescriptorDefinition = {
  id: string;
  slug: string;
  label: string;
  category: TeaDescriptorCategory;
  aliases: string[];
  position: number;
};

function descriptor(
  position: number,
  slug: string,
  label: string,
  category: TeaDescriptorCategory,
  aliases: string[] = []
): TeaDescriptorDefinition {
  const namespace = position <= 12 ? "10000000" : "20000000";
  return {
    id: `${namespace}-0000-4000-8000-${String(position).padStart(12, "0")}`,
    slug,
    label,
    category,
    aliases,
    position
  };
}

export const TEA_DESCRIPTOR_PALETTE: TeaDescriptorDefinition[] = [
  descriptor(1, "honeyed", "Honeyed", "Sweet & baked", ["honey", "nectar"]),
  descriptor(2, "orchid", "Orchid", "Floral"),
  descriptor(3, "buttery", "Buttery", "Mouthfeel", ["butter", "rich"]),
  descriptor(4, "toasted-grain", "Toasted grain", "Roasted & nutty", ["toast", "roasted barley", "grain"]),
  descriptor(5, "stone-fruit", "Stone fruit", "Fruit", ["peach", "apricot", "plum", "nectarine"]),
  descriptor(6, "cream", "Cream", "Sweet & baked", ["creamy", "dairy"]),
  descriptor(7, "green-bean", "Green bean", "Green & vegetal", ["bean", "beany"]),
  descriptor(8, "jasmine", "Jasmine", "Floral"),
  descriptor(9, "caramel", "Caramel", "Sweet & baked", ["toffee"]),
  descriptor(10, "mineral", "Mineral", "Earth, wood & mineral", ["rock", "flint"]),
  descriptor(11, "citrus-peel", "Citrus peel", "Fruit", ["lemon peel", "orange zest", "bergamot"]),
  descriptor(12, "sweet-hay", "Sweet hay", "Green & vegetal", ["hay", "straw"]),

  descriptor(13, "sweet", "Sweet", "Basic taste", ["sweetness"]),
  descriptor(14, "umami", "Umami", "Basic taste", ["savoury", "savory"]),
  descriptor(15, "bitter", "Bitter", "Basic taste", ["bitterness"]),
  descriptor(16, "tart", "Tart", "Basic taste", ["acidic", "sour", "acidity"]),
  descriptor(17, "saline", "Saline", "Basic taste", ["salty", "briny"]),

  descriptor(18, "rose", "Rose", "Floral"),
  descriptor(19, "osmanthus", "Osmanthus", "Floral"),
  descriptor(20, "violet", "Violet", "Floral"),
  descriptor(21, "honeysuckle", "Honeysuckle", "Floral"),
  descriptor(22, "chamomile", "Chamomile", "Floral"),

  descriptor(23, "apple", "Apple", "Fruit", ["red apple", "green apple"]),
  descriptor(24, "pear", "Pear", "Fruit"),
  descriptor(25, "muscat-grape", "Muscat grape", "Fruit", ["muscatel", "grape", "raisin"]),
  descriptor(26, "lychee", "Lychee", "Fruit", ["litchi", "longan"]),
  descriptor(27, "lemon", "Lemon", "Fruit", ["lemon juice"]),
  descriptor(28, "red-berries", "Red berries", "Fruit", ["strawberry", "raspberry", "cranberry"]),
  descriptor(29, "tropical-fruit", "Tropical fruit", "Fruit", ["mango", "pineapple", "passionfruit"]),
  descriptor(30, "dried-fruit", "Dried fruit", "Fruit", ["date", "fig", "prune"]),

  descriptor(31, "fresh-grass", "Fresh grass", "Green & vegetal", ["grassy", "cut grass"]),
  descriptor(32, "spinach", "Spinach", "Green & vegetal", ["leafy greens"]),
  descriptor(33, "asparagus", "Asparagus", "Green & vegetal"),
  descriptor(34, "pea-shoot", "Pea shoot", "Green & vegetal", ["peas", "snap pea"]),
  descriptor(35, "seaweed", "Seaweed", "Green & vegetal", ["nori", "marine"]),
  descriptor(36, "mint", "Mint", "Green & vegetal", ["peppermint", "spearmint"]),
  descriptor(37, "fresh-herbs", "Fresh herbs", "Green & vegetal", ["parsley", "basil", "herbal"]),
  descriptor(38, "cucumber", "Cucumber", "Green & vegetal", ["melon rind"]),

  descriptor(39, "brown-sugar", "Brown sugar", "Sweet & baked", ["demerara", "muscovado"]),
  descriptor(40, "vanilla", "Vanilla", "Sweet & baked"),
  descriptor(41, "cocoa", "Cocoa", "Sweet & baked", ["chocolate", "cacao"]),
  descriptor(42, "malt", "Malt", "Sweet & baked", ["malty"]),
  descriptor(43, "biscuit", "Biscuit", "Sweet & baked", ["cookie", "cracker"]),
  descriptor(44, "pastry", "Pastry", "Sweet & baked", ["baked bread", "pie crust"]),
  descriptor(45, "coconut", "Coconut", "Sweet & baked"),

  descriptor(46, "chestnut", "Chestnut", "Roasted & nutty"),
  descriptor(47, "almond", "Almond", "Roasted & nutty", ["marzipan"]),
  descriptor(48, "hazelnut", "Hazelnut", "Roasted & nutty"),
  descriptor(49, "sesame", "Sesame", "Roasted & nutty"),
  descriptor(50, "coffee", "Coffee", "Roasted & nutty", ["espresso"]),
  descriptor(51, "charcoal", "Charcoal", "Roasted & nutty", ["ashy", "sooty"]),
  descriptor(52, "smoke", "Smoke", "Roasted & nutty", ["smoky", "woodsmoke"]),

  descriptor(53, "cinnamon", "Cinnamon", "Spice"),
  descriptor(54, "clove", "Clove", "Spice"),
  descriptor(55, "cardamom", "Cardamom", "Spice"),
  descriptor(56, "ginger", "Ginger", "Spice"),
  descriptor(57, "black-pepper", "Black pepper", "Spice", ["peppery"]),
  descriptor(58, "camphor", "Camphor", "Spice", ["eucalyptus"]),

  descriptor(59, "wet-stone", "Wet stone", "Earth, wood & mineral", ["petrichor", "river stone"]),
  descriptor(60, "cedar", "Cedar", "Earth, wood & mineral", ["cedarwood"]),
  descriptor(61, "sandalwood", "Sandalwood", "Earth, wood & mineral"),
  descriptor(62, "forest-floor", "Forest floor", "Earth, wood & mineral", ["leaf litter", "undergrowth"]),
  descriptor(63, "earthy", "Earthy", "Earth, wood & mineral", ["soil"]),
  descriptor(64, "leather", "Leather", "Earth, wood & mineral"),
  descriptor(65, "tobacco", "Tobacco", "Earth, wood & mineral"),
  descriptor(66, "mushroom", "Mushroom", "Earth, wood & mineral", ["fungal"]),
  descriptor(67, "fermented", "Fermented", "Earth, wood & mineral", ["fermentation"]),
  descriptor(68, "aged", "Aged", "Earth, wood & mineral", ["aged wood", "antique"]),

  descriptor(69, "silky", "Silky", "Mouthfeel", ["silken", "smooth"]),
  descriptor(70, "velvety", "Velvety", "Mouthfeel", ["soft"]),
  descriptor(71, "thick", "Thick", "Mouthfeel", ["dense", "full-bodied"]),
  descriptor(72, "brothy", "Brothy", "Mouthfeel", ["soup-like"]),
  descriptor(73, "juicy", "Juicy", "Mouthfeel", ["succulent"]),
  descriptor(74, "drying-astringent", "Drying / astringent", "Mouthfeel", ["astringent", "puckering", "drying"]),
  descriptor(75, "brisk", "Brisk", "Mouthfeel", ["lively"]),
  descriptor(76, "cooling", "Cooling", "Mouthfeel", ["refreshing"]),

  descriptor(77, "musty", "Musty", "Off-notes", ["mouldy", "moldy"]),
  descriptor(78, "stale", "Stale", "Off-notes", ["flat"]),
  descriptor(79, "paper-cardboard", "Paper / cardboard", "Off-notes", ["papery", "cardboard"]),
  descriptor(80, "metallic", "Metallic", "Off-notes", ["metal", "tinny"]),
  descriptor(81, "sulphur", "Sulphur", "Off-notes", ["sulfur", "eggy"])
];

export function normalizeTeaDescriptor(value: string): string {
  return value.trim().toLocaleLowerCase("en-CA").replace(/[\s_/-]+/g, " ");
}

const paletteByTerm = new Map(TEA_DESCRIPTOR_PALETTE.flatMap(descriptor =>
  [descriptor.label, descriptor.slug, ...descriptor.aliases].map(term => [normalizeTeaDescriptor(term), descriptor] as const)
));

export function findTeaDescriptor(value: string): TeaDescriptorDefinition | null {
  return paletteByTerm.get(normalizeTeaDescriptor(value)) ?? null;
}
