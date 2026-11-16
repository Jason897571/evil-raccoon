"""目录配置：爱发电商品名 → 本地发布目录，以及首屏的 12 格技能。"""

# 爱发电商品名里的主题词 → (slug, 筛选元素, pixel-skill/release 下的目录)
PACKS: dict[str, tuple[str, str, str]] = {
    "时间": ("time", "时间", "itch_time_164"),
    "召唤兽 2": ("summon-2", "召唤", "itch_summon_264"),
    "召唤兽": ("summon", "召唤", "itch_summon64"),
    "鲜血 2": ("blood-2", "血", "itch_blood_264"),
    "鲜血": ("blood", "血", "itch_blood64"),
    "水晶 2": ("crystal-2", "水晶", "itch_crystal_264"),
    "水晶": ("crystal", "水晶", "itch_crystal64"),
    "自然 3": ("nature-3", "自然", "itch_nature_364"),
    "自然 2": ("nature-2", "自然", "itch_nature_264"),
    "自然": ("nature", "自然", "itch_nature_164"),
    "星陨": ("starfall", "星辰", "itch_starfall64"),
    "机械齿轮": ("clockwork", "机械", "itch_clockwork64"),
    "剧毒": ("poison", "毒", "itch_poison64"),
    "剑气": ("sword", "剑", "itch_sword64"),
    "空间": ("space", "空间", "itch_space64"),
    "暗影": ("dark", "暗影", "itch_dark64"),
    "圣光": ("holy", "圣光", "itch_holy64"),
    "水": ("water", "水", "itch_water64"),
    "大地": ("earth", "土", "itch_earth64"),
    "风": ("wind", "风", "itch_wind64"),
    "雷电": ("lightning", "雷", "itch_lightning64"),
    "寒冰": ("ice", "冰", "itch_ice64"),
    "火焰": ("fire", "火", "itch_fire64"),
    "剑气 2": ("sword-2", "剑", "itch_sword_264"),
}

# 筛选栏的元素顺序（照爱发电简介里「做过的」排列）
ELEMENT_ORDER = ["火", "冰", "雷", "风", "土", "水", "圣光", "暗影", "空间", "自然",
                 "剑", "毒", "机械", "星辰", "时间", "水晶", "血", "召唤"]

# 首屏 12 格，和爱发电头图一致：左 2×2、中间 4 格、右 2×2
HERO_TILES: list[tuple[str, str]] = [
    ("雷", "lightning_02_thunderstrike"),
    ("圣光", "holy_02_judgment"),
    ("冰", "ice_02_frost_nova"),
    ("剑", "sword_05_sword_intent_slash"),
    ("火", "fire_04_meteor"),
    ("水", "water_05_whirlpool"),
    ("自然", "nature_03_flower_nova"),
    ("水晶", "crystal_06_radiant_prism"),
    ("风", "wind_02_tornado"),
    ("空间", "space_02_portal"),
    ("毒", "poison_02_skull_blight_burst"),
    ("星辰", "starfall_10_supernova"),
]
