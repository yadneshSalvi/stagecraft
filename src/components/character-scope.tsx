"use client";
import { Check, Shirt, UserRound } from "lucide-react";
import { useProduction } from "./production-context";
import { Button } from "./ui";

export function CharacterScope() {
  const { project, send, busy } = useProduction();
  if (!project.characters.length) return null;
  return (
    <section className="character-scope">
      <div className="section-title">
        <div>
          <h2>Wardrobe scope</h2>
        </div>
      </div>
      <div className="scope-rows">
        {project.characters.map((character) => (
          <div key={character.id}>
            <div>
              <strong>{character.name}</strong>
              <span>
                {character.ownClothes
                  ? "Own clothes"
                  : project.performers.find(
                      (performer) => performer.id === character.performerId,
                    )?.name || "No performer"}
              </span>
            </div>
            <Button
              variant="quiet"
              aria-pressed={!!character.ownClothes}
              disabled={busy}
              onClick={() =>
                void send({
                  type: "set_own_clothes",
                  characterId: character.id,
                  ownClothes: !character.ownClothes,
                })
              }
            >
              {character.ownClothes ? <Check size={15} /> : <Shirt size={15} />}
              {character.ownClothes ? "Own clothes" : "Managed wardrobe"}
              <UserRound size={13} />
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
