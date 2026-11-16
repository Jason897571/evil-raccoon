from tests.conftest import login, login_admin


def slots(**overrides) -> list[dict]:
    """12 格：默认都用 time_01（种子数据里预览图为空，所以给个 GIF）。"""
    base = [{"label": f"格{i}", "skill_code": "time_01", "gif_url": f"/media/g{i}.gif"} for i in range(12)]
    for i, slot in overrides.items():
        base[int(i.removeprefix("s"))] = slot
    return base


def test_admin_sets_hero_and_home_shows_it(client):
    login_admin(client)
    assert client.get("/api/admin/hero").json() == []
    body = slots(s0={"label": "火", "skill_code": "fire_01", "gif_url": "/media/custom.gif"},
                 s1={"label": "随便", "skill_code": None, "gif_url": "/media/only-gif.gif"})
    res = client.put("/api/admin/hero", json={"slots": body})
    assert res.status_code == 200, res.text
    first = res.json()[0]
    assert first["skill_code"] == "fire_01" and first["pack_slug"] == "fire" and first["pack_published"] is True

    hero = client.get("/api/home").json()["hero"]
    assert len(hero) == 12
    assert hero[0] == {"label": "火", "skill_name": "技能", "gif_url": "/media/custom.gif"}
    assert hero[1] == {"label": "随便", "skill_name": "随便", "gif_url": "/media/only-gif.gif"}  # 没选技能时用标签


def test_gif_defaults_to_skill_preview(client):
    login_admin(client)
    client.patch("/api/admin/packs/wind/skills/wind_01", json={"preview_gif_url": "/media/wind.gif"})
    res = client.put("/api/admin/hero", json={"slots": slots(s5={"label": "风", "skill_code": "wind_01", "gif_url": ""})})
    assert res.json()[5]["gif_url"] == "/media/wind.gif"


def test_hero_validation(client):
    login_admin(client)
    assert client.put("/api/admin/hero", json={"slots": slots()[:11]}).status_code == 422
    res = client.put("/api/admin/hero", json={"slots": slots(s2={"label": "x", "skill_code": "nope", "gif_url": "/a.gif"})})
    assert res.status_code == 422 and "nope" in res.json()["detail"]
    # 没动图（技能没有预览图，也没上传）
    res = client.put("/api/admin/hero", json={"slots": slots(s3={"label": "x", "skill_code": "time_01", "gif_url": ""})})
    assert res.status_code == 422 and "第 4 格" in res.json()["detail"]


def test_deleting_skill_keeps_slot(client):
    login_admin(client)
    client.put("/api/admin/hero", json={"slots": slots()})
    client.post("/api/admin/packs/time/skills", json={"code": "time_02", "name": "第二个"})
    client.delete("/api/admin/packs/time/skills/time_01")
    hero = client.get("/api/home").json()["hero"]
    assert hero[0] == {"label": "格0", "skill_name": "格0", "gif_url": "/media/g0.gif"}
    assert client.get("/api/admin/hero").json()[0]["skill_code"] is None


def test_hero_requires_admin(client):
    assert client.get("/api/admin/hero").status_code == 401
    login(client)
    assert client.put("/api/admin/hero", json={"slots": slots()}).status_code == 403
