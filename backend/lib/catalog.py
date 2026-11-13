"""Fixed clothing catalog: camisetas, regatas e shorts — tamanhos P–GG.

Cores por produto:
- Camiseta: 12 cores
- Regata: marrom, preta, bege, branca
- Short: branca, preta, azul marinho
"""

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
REGATA_COLORS = ["marrom", "preta", "bege", "branca"]
SHORT_COLORS = ["branca", "preta", "azul_marinho"]

COLOR_NAMES = {
    "cinza": "Cinza",
    "roxo": "Roxo",
    "amarelo": "Amarelo",
    "azul_royal": "Azul Royal",
    "azul_marinho": "Azul Marinho",
    "preta": "Preta",
    "branca": "Branca",
    "caqui": "Caqui",
    "marrom": "Marrom",
    "rosa": "Rosa",
    "off_white": "Off White",
    "vermelha": "Vermelha",
    "bege": "Bege",
}

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
        "colors": REGATA_COLORS,
    },
    {
        "id": "short",
        "name": "Short",
        "name_plural": "Shorts",
        "description": "Shorts casuais e esportivos",
        "colors": SHORT_COLORS,
    },
]

TOTAL_VARIANTS = 48 + 16 + 12  # 76
