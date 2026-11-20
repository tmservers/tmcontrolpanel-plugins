import {
  Label,
  Page,
  Panel,
  ScriptPrelude,
  Table,
  WidgetFrame,
  WindowFrame,
  kit,
} from "@tmcontrolpanel/plugin-sdk/ui";
import type { WidgetRenderProps } from "@tmcontrolpanel/plugin-sdk";
import { Manialink } from "maniatsx";
import { slot } from "maniatsx/theme";
import { client, ml, Publish, type Integer } from "maniatsx/client";
import { TextLib } from "maniatsx/maniascript";
import { HELP_WIDTH, helpData } from "./help";
import type { OpenplanetWindowData } from "./types";

// Rows per page that fit the 75-unit window below the summary
const PAGE_SIZE = 13;
interface DetectorSettings {
  // 0 checks only when the page loads
  interval: Integer;
  // The host's prefix for this plugin's actions
  actionPrefix: string;
}

// Written by the detector's update page
const settings = client.shared<DetectorSettings>("detector", {
  interval: 0,
  actionPrefix: "",
});
const lastInfo = client.state<string>("");
const lastCheck = client.state<Integer>(0);

// Reports System.ExtraTool_Info, which holds the Openplanet version and signature mode
const sendInfo = client.fn((info: string): void => {
  const prefix = settings.value.actionPrefix;
  if (info === "") ml.TriggerPageAction(prefix + "check");
  else ml.TriggerPageAction(prefix + "check-" + TextLib.URLEncode(info));
});

function DetectorBehavior() {
  client.onInit(() => {
    lastInfo.value = ml.System!.ExtraTool_Info;
    lastCheck.value = ml.Now;
    sendInfo(lastInfo.value);
  });
  client.onFrame(() => {
    if (
      settings.value.interval > 0 &&
      ml.Now - lastCheck.value >= settings.value.interval
    ) {
      lastCheck.value = ml.Now;
      if (ml.System!.ExtraTool_Info !== lastInfo.value) {
        lastInfo.value = ml.System!.ExtraTool_Info;
        sendInfo(lastInfo.value);
      }
    }
  });
  return null;
}

// No visible controls: the page only runs the check
export function Detector(props: WidgetRenderProps) {
  return (
    <WidgetFrame {...props}>
      <DetectorBehavior />
    </WidgetFrame>
  );
}

export function DetectorUpdate(props: WidgetRenderProps) {
  return (
    <Manialink id={props.id}>
      <Publish to={settings} value={props.data as DetectorSettings} />
    </Manialink>
  );
}

export function HelpComponent(props: WidgetRenderProps) {
  const data = props.data as ReturnType<typeof helpData>["data"];
  return (
    <Page id={props.id}>
      <ScriptPrelude />
      <WindowFrame
        id={props.id}
        title="Openplanet check"
        size={[props.size.x, props.size.y]}
      >
        <Label
          tone="contentText"
          font="title"
          pos={[props.size.x / 2, -4]}
          size={[props.size.x - 8, 5]}
          text={data.headline}
          halign="center"
          valign="center2"
          textsize={2}
        />
        {data.detail ? (
          <Label
            tone="contentText"
            font="body"
            pos={[props.size.x / 2, -9]}
            size={[props.size.x - 8, 4]}
            text={data.detail}
            halign="center"
            valign="center2"
            textsize={1}
          />
        ) : null}
        {data.rules ? (
          <Label
            tone="contentTextMuted"
            font="body"
            pos={[props.size.x / 2, -13]}
            size={[props.size.x - 8, 4]}
            text={data.rules}
            halign="center"
            valign="center2"
            textsize={0.9}
          />
        ) : null}
        {data.sections.map((section) => (
          <frame pos={[4, section.y]} size={[props.size.x - 8, section.height]}>
            <Panel
              tone="contentAlt"
              size={[props.size.x - 8, section.height]}
            />
            <Panel tone="surface" size={[0.6, section.height]} />
            <Label
              tone="contentText"
              font="title"
              pos={[3, -3.5]}
              size={[props.size.x - 14, 4]}
              text={section.question}
              valign="center2"
              textsize={1.1}
            />
            {section.steps.map((step) => (
              <>
                <Label
                  tone="contentTextMuted"
                  font="title"
                  pos={[3, step.y]}
                  size={[4, 4]}
                  text={`${step.number}.`}
                  valign="center2"
                  textsize={1}
                />
                <Label
                  tone="contentText"
                  font="body"
                  pos={[7, step.y]}
                  size={[props.size.x - 18, 4]}
                  text={step.text}
                  valign="center2"
                  textsize={1}
                />
              </>
            ))}
          </frame>
        ))}
        {data.footer.map((line) => (
          <Label
            tone="contentTextMuted"
            font="body"
            pos={[props.size.x / 2, line.y]}
            size={[props.size.x - 8, 4]}
            text={line.text}
            halign="center"
            valign="center2"
            textsize={0.9}
          />
        ))}
      </WindowFrame>
    </Page>
  );
}
export interface SignaturesActions {
  prev: string;
  next: string;
}

const ALERT = "F00";

function DefaultSignatures(
  props: WidgetRenderProps & { actions: SignaturesActions },
) {
  const data = props.data as OpenplanetWindowData;
  const { color } = kit.useTokens();
  return (
    <Page id={props.id}>
      <ScriptPrelude />
      <WindowFrame id={props.id} title={props.title} size={[120, 75]}>
        <frame pos={[2, -2]} size={[116, 71]}>
          {data.stats.map((stat, i) => (
            <frame pos={[i * 26, 0]} size={[24, 7]}>
              <Panel tone="contentAlt" size={[24, 7]} />
              <quad
                size={[0.6, 7]}
                bgcolor={stat.alert ? ALERT : color.surface}
              />
              <Label
                tone="contentTextMuted"
                font="title"
                pos={[2.5, -2.2]}
                size={[20, 3]}
                text={stat.label}
                valign="center2"
                textsize={0.7}
              />
              <label
                pos={[2.5, -5]}
                size={[20, 4]}
                text={String(stat.value)}
                valign="center2"
                textsize={1.6}
                textfont="GameFontSemiBold"
                textcolor={stat.alert ? ALERT : color.contentText}
              />
            </frame>
          ))}
          {data.rules.map((rule, i) => (
            <Label
              tone="contentTextMuted"
              font="body"
              pos={[116, -2 - i * 3]}
              size={[38, 3]}
              text={rule}
              halign="right"
              valign="center2"
              textsize={0.7}
            />
          ))}
          <Table
            table={data.table}
            pos={[0, -9]}
            prevAction={props.actions.prev}
            nextAction={props.actions.next}
          />
        </frame>
      </WindowFrame>
    </Page>
  );
}

// Stat and policy tiles across the full width, 1 unit apart
function broadcastTiles(data: OpenplanetWindowData) {
  const tiles = [
    ...data.stats.map((stat) => ({
      label: stat.label,
      value: String(stat.value),
      alert: stat.alert ?? false,
      numeric: true,
      width: 15,
    })),
    {
      label: "Signatures",
      value: data.policy.signatures,
      alert: false,
      numeric: false,
      width: 32,
    },
    {
      label: "Min version",
      value: data.policy.minVersion,
      alert: false,
      numeric: false,
      width: 16,
    },
    {
      label: "Action",
      value: data.policy.action,
      alert: false,
      numeric: false,
      width: 18,
    },
  ];
  let x = 0;
  return tiles.map((tile) => {
    const placed = { ...tile, x };
    x += tile.width + 1;
    return placed;
  });
}

function BroadcastSignatures(
  props: WidgetRenderProps & { actions: SignaturesActions },
) {
  const data = props.data as OpenplanetWindowData;
  return (
    <Page id={props.id}>
      <ScriptPrelude />
      <WindowFrame id={props.id} title={props.title} size={[120, 75]}>
        <frame pos={[2, -2]} size={[116, 71]}>
          {broadcastTiles(data).map((tile) => (
            <frame pos={[tile.x, 0]} size={[tile.width, 7]}>
              <quad size={[tile.width, 7]} bgcolor="000" opacity={0.4} />
              <Label
                tone="contentTextMuted"
                font="title"
                pos={[1.5, -2]}
                size={[tile.width - 3, 3]}
                text={tile.label.toUpperCase()}
                valign="center2"
                textsize={0.65}
              />
              <label
                pos={[1.5, -5.2]}
                size={[tile.width - 3, 4]}
                text={tile.value}
                valign="center2"
                textsize={tile.numeric ? 1.6 : 1.2}
                textfont="Oswald"
                textcolor={tile.alert ? "F45" : "EEF"}
              />
            </frame>
          ))}
          <frame pos={[0, -9]} size={[116, 60]}>
            <quad
              size={[116, data.table.rowHeight]}
              bgcolor="000"
              opacity={0.4}
            />
            {data.table.columns.map((column) => (
              <Label
                tone="contentTextMuted"
                font="title"
                pos={[column.x, data.table.textY]}
                size={[column.width, data.table.rowHeight]}
                text={column.title.toUpperCase()}
                halign={column.halign}
                valign="center2"
                textsize={0.75}
              />
            ))}
            {data.table.rows.map((row) => (
              <frame pos={[0, row.y]} size={[116, data.table.rowHeight]}>
                {row.odd && (
                  <quad
                    size={[116, data.table.rowHeight]}
                    bgcolor="FFF"
                    opacity={0.05}
                  />
                )}
                {row.cells[4]?.text !== "OK" && (
                  <quad
                    size={[116, data.table.rowHeight]}
                    bgcolor="F45"
                    opacity={0.1}
                  />
                )}
                {row.cells.map((cell, i) => (
                  <label
                    pos={[cell.x, data.table.textY]}
                    size={[cell.width, data.table.rowHeight]}
                    text={cell.text}
                    halign={cell.halign}
                    valign="center2"
                    textsize={0.9}
                    textfont="RajdhaniMono"
                    textcolor={
                      i === 4
                        ? cell.text === "OK"
                          ? "3D8"
                          : "F45"
                        : i === 1
                          ? cell.text === ""
                            ? "3D8"
                            : "F45"
                          : "EEF"
                    }
                  />
                ))}
              </frame>
            ))}
            {data.table.pages !== 1 && (
              <frame pos={[0, data.table.pagerY]} size={[116, 5]}>
                <Label
                  tone="contentText"
                  font="body"
                  pos={[1, -3]}
                  size={[86, 4]}
                  text={`${data.table.from}-${data.table.to} of ${data.table.total}`}
                  valign="center2"
                  textsize={0.9}
                />
                <Label
                  tone="contentText"
                  font="title"
                  pos={[94, -3]}
                  size={[10, 4]}
                  text=" Prev"
                  halign="center"
                  valign="center2"
                  textsize={0.9}
                  {...(data.table.hasPrev
                    ? { action: props.actions.prev }
                    : { opacity: 0.3 })}
                />
                <Label
                  tone="contentText"
                  font="body"
                  pos={[102, -3]}
                  size={[6, 4]}
                  text={`${data.table.page}/${data.table.pages}`}
                  halign="center"
                  valign="center2"
                  textsize={0.9}
                />
                <Label
                  tone="contentText"
                  font="title"
                  pos={[110, -3]}
                  size={[6, 4]}
                  text="Next "
                  halign="center"
                  valign="center2"
                  textsize={0.9}
                  {...(data.table.hasNext
                    ? { action: props.actions.next }
                    : { opacity: 0.3 })}
                />
              </frame>
            )}
          </frame>
        </frame>
      </WindowFrame>
    </Page>
  );
}

export const SignaturesComponent = slot<
  WidgetRenderProps & { actions: SignaturesActions }
>("openplanet/signatures", DefaultSignatures, {
  broadcast: BroadcastSignatures,
});

export function signaturesComponent(actions: SignaturesActions) {
  return (props: WidgetRenderProps) => (
    <SignaturesComponent {...props} actions={actions} />
  );
}
