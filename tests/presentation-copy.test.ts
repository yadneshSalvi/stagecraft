import { describe, expect, it } from "vitest";
import {
  displayApproval,
  displayFixtureText,
  displayInspectionNotes,
} from "@/lib/presentation-copy";

describe("concise presentation preserves stored and user-authored evidence", () => {
  it("shortens only explicit example decisions without changing the record", () => {
    const approval = {
      approvedBy: "Example reviewer (sample decision)",
      rationale: "Synthetic demonstration decision.",
      decisionSource: "example",
      id: "historical-approval",
    };
    const before = structuredClone(approval);
    expect(displayApproval(approval)).toEqual({
      approvedBy: "Example reviewer",
      rationale: "Example approval.",
    });
    expect(approval).toEqual(before);
    expect(
      displayApproval({ ...approval, decisionSource: "reviewer" }),
    ).toEqual({ approvedBy: before.approvedBy, rationale: before.rationale });
  });
  it("maps known legacy fixture copy only inside example productions", () => {
    const source = "Seabright Wardrobe · synthetic supplier";
    expect(displayFixtureText(source, true)).toBe("Seabright Wardrobe");
    expect(displayFixtureText(source, false)).toBe(source);
    expect(
      displayFixtureText("Synthetic silk collected by the crew.", true),
    ).toBe("Synthetic silk collected by the crew.");
  });
  it("retains concrete provider observations and unfamiliar inspection evidence", () => {
    const old =
      "Recorded YouCam hair-colour detail from the separate face source; inspect colour and facial/hair boundaries before approval. Requested preset is Chocolate Brown; root observed a wine/plum cast.";
    expect(displayInspectionNotes(old)).toBe(
      "Requested Chocolate Brown appears wine/plum. Inspect colour and facial/hair boundaries.",
    );
    const custom =
      "A brass button disappeared; inspect the reference before deciding.";
    expect(displayInspectionNotes(custom)).toBe(custom);
    expect(displayInspectionNotes()).toBe("");
  });
  it("removes only the legacy generic example warning, preserving actual unresolved requirements", () => {
    const generic =
      "Synthetic production exercise. Cast portraits, script and inventory are fictional; only explicitly labelled provider previews are actual recorded or live provider outputs. No physical or supplier outcome is implied.";
    expect(displayFixtureText(generic, true)).toBe("");
    expect(
      displayFixtureText("C-033 needs a fitting for Ada Mercer.", true),
    ).toBe("C-033 needs a fitting for Ada Mercer.");
    expect(displayFixtureText(generic, false)).toBe(generic);
  });
});
