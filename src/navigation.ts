type RoomGraph = {
  rooms: { id: string }[];
  connections: { a: string; b: string }[];
};

/** Shortest room route through actual doors, with both directions traversable. */
export function roomRoute(
  graph: RoomGraph,
  from: string,
  to: string,
): string[] {
  if (
    !graph.rooms.some((r) => r.id === from) ||
    !graph.rooms.some((r) => r.id === to)
  )
    return [];
  const previous = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  for (let head = 0; head < queue.length; head++) {
    const room = queue[head];
    if (room === to) {
      const route: string[] = [];
      let current: string | null = to;
      while (current !== null) {
        route.push(current);
        current = previous.get(current)!;
      }
      return route.reverse();
    }
    for (const edge of graph.connections) {
      const next = edge.a === room ? edge.b : edge.b === room ? edge.a : null;
      if (next && !previous.has(next)) {
        previous.set(next, room);
        queue.push(next);
      }
    }
  }
  return [];
}
