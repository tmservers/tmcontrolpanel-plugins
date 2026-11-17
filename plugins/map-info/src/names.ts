// Swaps the name's last color change for $g when it is white, so the end of the
// name takes the widget's text color instead of white
export function resetTrailingWhite(name: string): string {
  let last: { index: number; code: string } | null = null;
  for (let i = 0; i < name.length; i++) {
    if (name[i] !== "$") continue;
    const next = name[i + 1] ?? "";
    // $$ is a literal dollar sign
    if (next === "$") {
      i++;
      continue;
    }
    const color = /^[0-9a-f]{3}/i.exec(name.slice(i + 1, i + 4));
    if (color) {
      last = { index: i, code: color[0] };
      i += 3;
    } else if (/[gz>]/i.test(next)) {
      // $g and $z reset the color, $> restores the one from before $<
      last = { index: i, code: next };
      i++;
    }
  }
  if (!last || last.code.toLowerCase() !== "fff") return name;
  return `${name.slice(0, last.index)}$g${name.slice(last.index + 4)}`;
}
