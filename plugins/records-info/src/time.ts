export function formatRecordTime(time: number): string {
  if (time <= 0) return "--:--.---";

  const totalSeconds = Math.floor(time / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const milliseconds = time - totalSeconds * 1000;
  const secondText = String(seconds).padStart(2, "0");
  const millisecondText = String(milliseconds).padStart(3, "0");
  return minutes > 0
    ? `${minutes}:${secondText}.${millisecondText}`
    : `${secondText}.${millisecondText}`;
}
