// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { addLayer, dispatch, held, pushModal, top } from "../../src/input";

const key = (k: string, repeat = false) => new KeyboardEvent("keydown", { key: k, repeat });

describe("gestore dei tasti", () => {
  it("risponde solo il livello attivo più in alto", () => {
    const got: string[] = [];
    let dialog = false;
    const offs = [
      addLayer({ name: "mondo", priority: 0, active: () => true, key: (k) => void got.push(`mondo:${k}`) }),
      addLayer({ name: "dialogo", priority: 80, modal: true, active: () => dialog, key: (k) => void got.push(`dialogo:${k}`) }),
    ];
    dispatch(key("e"));
    dialog = true;
    dispatch(key("e"));
    expect(got).toEqual(["mondo:e", "dialogo:e"]);
    expect(top()).toBe("dialogo");
    offs.forEach((f) => f());
  });

  it("un livello modale si prende anche i tasti che non usa", () => {
    const got: string[] = [];
    const offs = [
      addLayer({ name: "mondo", priority: 0, active: () => true, key: (k) => void got.push(`mondo:${k}`) }),
      addLayer({ name: "telefono", priority: 50, modal: true, active: () => true, key: () => false }),
    ];
    expect(dispatch(key(" "))).toBe("telefono");
    expect(got).toEqual([]);
    offs.forEach((f) => f());
  });

  it("un livello non modale lascia passare i tasti che non usa", () => {
    const got: string[] = [];
    const offs = [
      addLayer({ name: "mondo", priority: 0, active: () => true, key: (k) => void got.push(`mondo:${k}`) }),
      addLayer({ name: "scorciatoie", priority: 10, active: () => true, key: (k) => (k === "m" ? true : false) }),
    ];
    dispatch(key("m"));
    dispatch(key("w"));
    expect(got).toEqual(["mondo:w"]);
    offs.forEach((f) => f());
  });

  it("un minigioco sta sopra tutto e, tolto, restituisce i tasti", () => {
    const got: string[] = [];
    const off0 = addLayer({ name: "dialogo", priority: 80, modal: true, active: () => true, key: (k) => void got.push(`dialogo:${k}`) });
    const off = pushModal("ometto", (k) => void got.push(`ometto:${k}`));
    dispatch(key("escape"));
    off();
    dispatch(key("escape"));
    expect(got).toEqual(["ometto:escape", "dialogo:escape"]);
    off0();
  });

  it("tiene i tasti premuti e li dimentica quando la finestra perde il fuoco", () => {
    dispatchEvent(new KeyboardEvent("keydown", { key: "W" }));
    expect(held.has("w")).toBe(true);
    dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
    expect(held.has("w")).toBe(false);
    dispatchEvent(new KeyboardEvent("keydown", { key: "Shift" }));
    dispatchEvent(new Event("blur"));
    expect(held.size).toBe(0);
  });
});
