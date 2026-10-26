import { layout, story } from "../engine";
import { button, el } from "./dom";

type FloorPlanOptions = {
  image: string;
  currentRoom: string;
  destination: string;
  position: { x: number; z: number };
  onChooseRoom: (id: string, name: string) => void;
};

/** Room hit areas use the same world bounds as the actual overhead photograph. */
export function drawFloorPlan(options: FloorPlanOptions): HTMLElement {
  const plan = el("div", "map floor-plan");
  plan.setAttribute("role", "group");
  plan.setAttribute("aria-label", "Mansion floor plan");
  const image = el("img", "floor-plan-render");
  image.src = options.image;
  image.alt =
    "The actual six furnished rooms of Blackrook Manor, viewed directly from above.";
  image.draggable = false;
  plan.append(image);

  // The photograph covers x=-0.5..24.5 and z=-0.5..16.5, with north at the top.
  const left = (x: number) => ((x + 0.5) / 25) * 100 + "%";
  const top = (z: number) => ((z + 0.5) / 17) * 100 + "%";
  for (const room of layout.rooms) {
    const current = room.id === options.currentRoom;
    const destination = room.id === options.destination;
    const area = button(
      "",
      () => options.onChooseRoom(room.id, room.name),
      "floor-plan-room" +
        (current ? " current" : "") +
        (destination ? " destination" : ""),
    );
    area.dataset.room = room.id;
    // Place the current-room caption away from the live position marker.
    if (current && options.position.z > (room.bounds[1] + room.bounds[3]) / 2)
      area.classList.add("label-at-top");
    area.style.left = left(room.bounds[0]);
    area.style.top = top(room.bounds[1]);
    area.style.width = ((room.bounds[2] - room.bounds[0]) / 25) * 100 + "%";
    area.style.height = ((room.bounds[3] - room.bounds[1]) / 17) * 100 + "%";
    const status = current
      ? "You are here"
      : destination
        ? "Destination"
        : room.id === "study"
          ? "Crime scene"
          : story.suspects.find((s) => s.room === room.id)?.name || "";
    area.setAttribute(
      "aria-label",
      room.name +
        (current ? ", you are here" : destination ? ", destination" : ""),
    );
    if (current) area.setAttribute("aria-current", "location");
    area.append(
      el("span", "floor-plan-label", room.name, el("small", "", status)),
    );
    plan.append(area);
  }
  const marker = el("span", "floor-plan-position");
  marker.style.left = left(options.position.x);
  marker.style.top = top(options.position.z);
  marker.setAttribute("role", "img");
  marker.setAttribute("aria-label", "Detective Knight’s current position");
  plan.append(marker);
  return plan;
}
