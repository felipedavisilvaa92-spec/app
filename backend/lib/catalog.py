"""Fixed clothing catalog: 3 product types, sizes P–GG, 108 variants total."""

SIZES = ["P", "M", "G", "GG"]

CORE_COLORS = [
    "cinza",
    "roxo",
    "amarelo",
    "azul_royal",
    "azul_marinho",
    "preta",
    "branca",
    "caqui",
    "marrom",
    "rosa",
    "off_white",
    "vermelha",
]
SHORT_COLORS = ["branca", "preta", "azul_marinho"]

PRODUCTS = [
    {
        "id": "camiseta",
        "name": "Camiseta",
        "name_plural": "Camisetas",
        "description": "Camisetas unissex em algodão",
        "colors": CORE_COLORS,
    },
    {
        "id": "regata",
        "name": "Regata",
        "name_plural": "Regatas",
        "description": "Regatas casuais e caneladas",
        "colors": CORE_COLORS,
    },
    {
        "id": "short",
        "name": "Short",
        "name_plural": "Shorts",
        "description": "Shorts casuais e esportivos",
        "colors": SHORT_COLORS,
    },
]

TOTAL_VARIANTS = 48 + 48 + 12  # 108
