"use client";
import Link from "next/link";
import { ArrowUpRight, Palette, Scissors } from "lucide-react";
import type { Production } from "@/lib/types";
import {
  getCurrentApproval,
  getCurrentPreview,
  getCurrentBeautyApproval,
  getCurrentBeautyPreview,
} from "@/lib/domain/selectors";
import { Photo } from "./ui";
import {
  getCurrentDetailApproval,
  getCurrentDetailPreview,
} from "@/lib/domain/details";

export function ContinuityWall({
  project,
  affectedLookIds = [],
  compact = false,
}: {
  project: Production;
  affectedLookIds?: string[];
  compact?: boolean;
}) {
  const days = [...new Set(project.scenes.map((scene) => scene.storyDay))].sort(
    (a, b) => a - b,
  );
  const affected = new Set(affectedLookIds);
  if (!days.length) return null;
  return (
    <section
      className={`continuity-wall ${compact ? "continuity-wall-compact" : ""}`}
      aria-label={
        compact
          ? "Change impact across story days"
          : "Visual continuity across story days"
      }
    >
      <div className="continuity-wall-heading">
        <div>
          <h2>{compact ? "Affected looks" : "Looks by story day"}</h2>
        </div>
        <div className="continuity-legend" aria-label="Approval states">
          <span>
            <span className="wall-status-dot approved" />
            Approved
          </span>
          <span>
            <span className="wall-status-dot awaiting" />
            To review
          </span>
          {compact && (
            <span>
              <span className="wall-status-dot affected" />
              Affected
            </span>
          )}
        </div>
      </div>
      <div
        className="continuity-wall-scroll"
        tabIndex={0}
        role="region"
        aria-label="Character by story day; scroll horizontally for all days"
      >
        <table>
          <thead>
            <tr>
              <th scope="col">Character</th>
              {days.map((storyDay) => (
                <th scope="col" key={storyDay}>
                  <span>Day {storyDay}</span>
                  <small>
                    SC{" "}
                    {project.scenes
                      .filter((scene) => scene.storyDay === storyDay)
                      .map((scene) => scene.number)
                      .join(" · ")}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {project.characters
              .filter(
                (character) =>
                  !compact ||
                  !affected.size ||
                  project.looks.some(
                    (look) =>
                      affected.has(look.id) &&
                      look.characterId === character.id,
                  ),
              )
              .map((character) => {
                const performer = project.performers.find(
                  (item) => item.id === character.performerId,
                );
                return (
                  <tr key={character.id}>
                    <th scope="row">
                      <strong>{character.name}</strong>
                      <span>{performer?.name || "Awaiting casting"}</span>
                    </th>
                    {days.map((storyDay) => {
                      const looks = project.looks.filter(
                        (look) =>
                          look.characterId === character.id &&
                          look.sceneIds.some((id) =>
                            project.scenes.some(
                              (scene) =>
                                scene.id === id && scene.storyDay === storyDay,
                            ),
                          ),
                      );
                      const appears = project.scenes.some(
                        (scene) =>
                          scene.storyDay === storyDay &&
                          scene.characterIds.includes(character.id),
                      );
                      return (
                        <td key={storyDay}>
                          {looks.length ? (
                            looks.map((look) => {
                              const preview = getCurrentPreview(look, project);
                              const approval = getCurrentApproval(
                                look,
                                project,
                              );
                              const makeup = getCurrentBeautyPreview(look);
                              const makeupApproved =
                                getCurrentBeautyApproval(look);
                              const hair = getCurrentDetailPreview(
                                look,
                                "hair_color",
                                project,
                              );
                              const inset = makeup || hair;
                              const insetApproved = makeup
                                ? makeupApproved
                                : getCurrentDetailApproval(
                                    look,
                                    "hair_color",
                                    project,
                                  );
                              const body = project.performers.find(
                                (item) => item.id === look.performerId,
                              );
                              const changed = affected.has(look.id);
                              const status = changed
                                ? "affected"
                                : approval
                                  ? "approved"
                                  : "awaiting";
                              const unit = project.units.find(
                                (item) => item.id === look.unitIds[0],
                              );
                              const previous = project.looks.find(
                                (item) =>
                                  item.characterId === character.id &&
                                  item.storyDays.includes(
                                    days[days.indexOf(storyDay) - 1],
                                  ),
                              );
                              const garmentChanged =
                                previous &&
                                previous.unitIds.join("|") !==
                                  look.unitIds.join("|");
                              return (
                                <Link
                                  key={look.id}
                                  className={`continuity-cell ${status}`}
                                  href={`/production/${project.id}/looks?look=${look.id}`}
                                  aria-label={`${character.name}, story day ${storyDay}, ${unit?.name || look.title}. ${changed ? "Affected by this change" : approval ? "Appearance approved" : "Awaiting appearance review"}${inset ? `; separate ${makeup ? "makeup" : "hair colour"} ${insetApproved ? "approved" : "awaiting review"}` : ""}`}
                                >
                                  <div className="continuity-cell-image">
                                    <Photo
                                      natural
                                      src={preview?.imageUrl || body?.imageUrl}
                                      alt={`${character.name}: ${preview ? "YouCam garment result" : "source awaiting garment result"}`}
                                      sizes={
                                        compact
                                          ? "120px"
                                          : "(max-width: 700px) 160px, 220px"
                                      }
                                    />
                                    {inset && (
                                      <span
                                        className={`continuity-makeup ${insetApproved ? "approved" : "awaiting"}`}
                                        title={`Separate ${makeup ? "makeup" : "hair colour"} detail · ${insetApproved ? "approved" : "review needed"}`}
                                      >
                                        <Photo
                                          src={inset.imageUrl}
                                          alt={`${character.name}, separate YouCam ${makeup ? "makeup" : "hair colour"} detail`}
                                          fit="cover"
                                          sizes="72px"
                                        />
                                        <span>
                                          {makeup ? (
                                            <Palette
                                              size={10}
                                              aria-hidden="true"
                                            />
                                          ) : (
                                            <Scissors
                                              size={10}
                                              aria-hidden="true"
                                            />
                                          )}
                                        </span>
                                      </span>
                                    )}
                                    <ArrowUpRight
                                      className="continuity-open"
                                      size={16}
                                      aria-hidden="true"
                                    />
                                  </div>
                                  {garmentChanged && !compact && (
                                    <div className="continuity-cell-caption">
                                      <strong>
                                        {unit?.name || look.title}
                                      </strong>
                                    </div>
                                  )}
                                </Link>
                              );
                            })
                          ) : (
                            <div
                              className={`continuity-offstage ${appears && !character.ownClothes ? "needs-look" : ""}`}
                            >
                              {appears && !character.ownClothes ? (
                                <Link href={`/production/${project.id}/looks`}>
                                  Add look <ArrowUpRight size={12} />
                                </Link>
                              ) : (
                                <span>
                                  {appears ? "Own clothes" : "Off scene"}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
