import {
  definePlugin,
  rankPlayers,
  type ManialinkAnswer,
  type PluginContext,
  type Scores,
  type Waypoint,
  type Window,
  type WidgetRenderProps,
} from "@tmcontrolpanel/plugin-sdk";
import {
  Label,
  type LabelProps,
  Panel,
  Page,
  ScriptPrelude,
  WindowFrame,
  kit,
} from "@tmcontrolpanel/plugin-sdk/ui";
import { Manialink, type Vec2 } from "maniatsx";
import { client, Publish, type Integer } from "maniatsx/client";
import {
  CMlEntry,
  CMlFrame,
  CMlLabel,
  TextLib,
  vec2,
  vec3,
} from "maniatsx/maniascript";
import { isValidEcmApiKey } from "./validation";

export { isValidEcmApiKey };

interface Config {
  apiKey?: string;
  isRecording?: boolean;
  editors?: string[];
}

const ECM_URL = "https://us-central1-fantasy-trackmania.cloudfunctions.net";
const ECM_ICON = "https://i.imgur.com/DIjT0pA.png";

const WINDOW_SIZE: Vec2 = [54, 32.5];
const CONTENT_WIDTH = WINDOW_SIZE[0] - 4;
// Icon font glyphs: dot, eye and crossed eye
const DOT = "\uf111";
const EYE = "\uf06e";
const EYE_SLASH = "\uf070";

interface WindowView {
  isEditor: boolean;
  apiKey: string;
  isRecording: boolean;
  currentRound: Integer;
}

interface WindowActions {
  toggle: string;
  save: string;
  decrease: string;
  increase: string;
}

// Written by the update page, read by the window
const view = client.shared<WindowView>("window", {
  isEditor: false,
  apiKey: "",
  isRecording: false,
  currentRound: 1,
});
const contentRef = client.ref<CMlFrame>();
const dotRef = client.ref<CMlLabel>();
const toggleFrameRef = client.ref<CMlFrame>();
const apiKeyFrameRef = client.ref<CMlFrame>();
const roundFrameRef = client.ref<CMlFrame>();
const roundControlsRef = client.ref<CMlFrame>();
const entryRef = client.ref<CMlEntry>();
const eyeRef = client.ref<CMlLabel>();
const errorRef = client.ref<CMlLabel>();

const recordingText = client.fn((recording: boolean): string => {
  if (recording) return "Recording";
  return "Not Recording";
});
const toggleText = client.fn((recording: boolean): string => {
  if (recording) return "Stop recording";
  return "Start recording";
});

function WindowBehavior() {
  client.watch(view, () => {
    const editor = view.value.isEditor;
    if (editor) {
      toggleFrameRef.control.Show();
      apiKeyFrameRef.control.Show();
      roundControlsRef.control.Show();
      roundFrameRef.control.RelativePosition_V3 = vec2(0.0, -19.0);
    } else {
      toggleFrameRef.control.Hide();
      apiKeyFrameRef.control.Hide();
      roundControlsRef.control.Hide();
      roundFrameRef.control.RelativePosition_V3 = vec2(0.0, -6.0);
    }
    // 2/16 and 14/16: the template's 2D2 and D22
    if (view.value.isRecording)
      dotRef.control.TextColor = vec3(0.125, 0.875, 0.125);
    else dotRef.control.TextColor = vec3(0.875, 0.125, 0.125);
    entryRef.control.SetText(view.value.apiKey, false);
    contentRef.control.Show();
  });
  return null;
}

// A muted button with a thin underline, sending a native action (with the entry values)
function Button(props: {
  id: string;
  x: number;
  width: number;
  action: string;
  text: LabelProps["text"];
}) {
  return (
    <frame id={props.id} pos={[props.x, 0]} size={[props.width, 5]}>
      <Panel tone="contentAlt" size={[props.width, 5]} action={props.action} />
      <Panel tone="surface" pos={[0, -4.75]} size={[props.width, 0.25]} />
      <Label
        tone="contentText"
        font="body"
        pos={[props.width / 2, -2.25]}
        text={props.text}
        textsize={1}
        valign="center"
        halign="center"
      />
    </frame>
  );
}

function SectionTitle(props: { text: string }) {
  return (
    <Label
      tone="contentText"
      font="title"
      pos={[0, -2.25]}
      size={[25, 3]}
      text={props.text}
      textsize={0.6}
      valign="center"
    />
  );
}

function EcmWindow(props: WidgetRenderProps & { actions: WindowActions }) {
  const { color } = kit.useTokens();
  return (
    <Page id={props.id}>
      <ScriptPrelude />
      <WindowBehavior />
      <WindowFrame id={props.id} title={props.title} size={WINDOW_SIZE}>
        <frame
          ref={contentRef}
          pos={[2, -2]}
          size={[CONTENT_WIDTH, WINDOW_SIZE[1] - 4]}
          hidden
        >
          <frame size={[CONTENT_WIDTH, 5]}>
            <label
              ref={dotRef}
              text={DOT}
              pos={[0, -2.25]}
              textcolor="D22"
              textsize={1}
              valign="center"
            />
            <Label
              tone="contentText"
              font="body"
              pos={[3.5, -2.25]}
              size={[20, 5]}
              text={client.bind(() => recordingText(view.value.isRecording))}
              textsize={1}
              valign="center"
            />
            <frame ref={toggleFrameRef} pos={[25, 0]} size={[25, 5]}>
              <Button
                id="toggle-recording"
                x={0}
                width={25}
                action={props.actions.toggle}
                text={client.bind(() => toggleText(view.value.isRecording))}
              />
            </frame>
          </frame>

          <frame
            ref={apiKeyFrameRef}
            pos={[0, -6]}
            size={[CONTENT_WIDTH, 12.25]}
          >
            <SectionTitle text="API Key" />
            <frame pos={[0, -4.5]} size={[CONTENT_WIDTH, 7.75]}>
              <Panel tone="surface" pos={[0, -4.75]} size={[37, 0.25]} />
              <entry
                ref={entryRef}
                pos={[0, -2.25]}
                default=""
                size={[32, 5]}
                name="ecm-api-key-entry"
                id="ecm-api-key-entry"
                textsize={1}
                focusareacolor1={color.contentAlt}
                focusareacolor2={color.contentAlt}
                textcolor={color.contentText}
                textformat="Password"
                valuetype="Ml_String"
                valign="center"
                textfont="GameFontRegular"
                onSubmit={client.handler(() => {
                  const value = entryRef.control.Value;
                  const underscores: Integer =
                    TextLib.Split("_", value).length - 1;
                  if (TextLib.Length(value) > 0 && underscores !== 1)
                    errorRef.control.SetText(
                      "Expected 1 underscore, found " +
                        TextLib.ToText(underscores),
                    );
                  else errorRef.control.SetText("");
                })}
              />
              <label
                ref={eyeRef}
                pos={[34.5, -2.25]}
                size={[5, 5]}
                text={EYE}
                textcolor={color.contentText}
                focusareacolor1={color.contentAlt}
                focusareacolor2={color.contentAlt}
                halign="center"
                valign="center"
                textsize={1}
                onClick={client.handler(() => {
                  if (
                    entryRef.control.TextFormat ===
                    CMlEntry.ETextFormat.Password
                  ) {
                    entryRef.control.TextFormat = CMlEntry.ETextFormat.Basic;
                    eyeRef.control.SetText(EYE_SLASH);
                  } else {
                    entryRef.control.TextFormat = CMlEntry.ETextFormat.Password;
                    eyeRef.control.SetText(EYE);
                  }
                })}
              />
              <Button
                id="save-api-key"
                x={38}
                width={12}
                action={props.actions.save}
                text="Save"
              />
              <label
                ref={errorRef}
                pos={[0, -6.25]}
                size={[CONTENT_WIDTH, 3]}
                text=""
                textsize={0.6}
                textcolor="D22"
                valign="center"
                textfont="GameFontRegular"
              />
            </frame>
          </frame>

          <frame ref={roundFrameRef} pos={[0, -19]} size={[CONTENT_WIDTH, 9.5]}>
            <SectionTitle text="Round info" />
            <frame pos={[0, -4.5]} size={[CONTENT_WIDTH, 5]}>
              <Label
                tone="contentText"
                font="body"
                pos={[0, -2.25]}
                size={[12, 5]}
                text={client.bind(
                  () => "Round " + TextLib.ToText(view.value.currentRound),
                )}
                textsize={1}
                valign="center"
              />
              <frame ref={roundControlsRef}>
                <Button
                  id="decrease-round-offset"
                  x={14}
                  width={5}
                  action={props.actions.decrease}
                  text="-"
                />
                <Button
                  id="increase-round-offset"
                  x={20}
                  width={5}
                  action={props.actions.increase}
                  text="+"
                />
              </frame>
            </frame>
          </frame>
        </frame>
      </WindowFrame>
    </Page>
  );
}

function EcmWindowUpdate(props: WidgetRenderProps) {
  return (
    <Manialink id={props.id}>
      <Publish to={view} value={props.data as WindowView} />
    </Manialink>
  );
}

function isEditor(config: Config, login: string): boolean {
  const editors = config.editors ?? [];
  return editors.length === 0 || editors.includes(login);
}

class ECMPlugin {
  private roundOffset = 0;
  private readonly activeDrivers = new Set<string>();
  private readonly windows = new Map<string, Window>();
  private readonly actions: WindowActions;

  constructor(private readonly ctx: PluginContext<Config>) {
    this.actions = {
      toggle: ctx.ui.action("ecm-toggle-recording").name,
      save: ctx.ui.action("ecm-save-api-key").name,
      decrease: ctx.ui.action("ecm-decrease-round-offset").name,
      increase: ctx.ui.action("ecm-increase-round-offset").name,
    };
    ctx.on("finish", (waypoint) => this.onFinish(waypoint));
    ctx.on("scores", (scores) => this.onScores(scores));
    ctx.on("beginMap", () => {
      this.roundOffset = 0;
      this.refreshWindows();
    });
    ctx.on("startRound", () => {
      this.activeDrivers.clear();
      this.refreshWindows();
    });
    ctx.on("startLine", (event) => this.activeDrivers.add(event.login));

    ctx.command("ecm", (_, login) => this.openWindow(login));
    ctx.action("open", (answer) => this.openWindow(answer.login));

    // Window buttons; every window shares the action names, so check the clicking login
    ctx.action("ecm-toggle-recording", (answer) =>
      this.onToggleRecording(answer),
    );
    ctx.action("ecm-save-api-key", (answer) => this.onSaveApiKey(answer));
    ctx.action("ecm-increase-round-offset", (answer) =>
      this.onRoundOffset(answer, 1),
    );
    ctx.action("ecm-decrease-round-offset", (answer) =>
      this.onRoundOffset(answer, -1),
    );
  }

  start() {
    this.ctx.ui.addButton({
      name: "ecm",
      icon: ECM_ICON,
      type: "image",
      action: "open",
    });
  }

  onConfigUpdate() {
    this.refreshWindows();
  }

  private isActive(): boolean {
    const { live } = this.ctx;
    const { liveInfo } = live;
    const config = this.ctx.config();
    return (
      !!live.activeMapUid &&
      !liveInfo.isPaused &&
      !liveInfo.isWarmUp &&
      !!config.apiKey &&
      !!config.isRecording
    );
  }

  private roundNum(): number {
    return (this.ctx.live.roundNumber || 1) + this.roundOffset;
  }

  // Fire and forget: a failing report is logged, it never interrupts the game
  private async post(endpoint: string, body: unknown): Promise<void> {
    const [matchId, authToken] = (this.ctx.config().apiKey ?? "").split("_");
    if (!matchId || !authToken) {
      this.ctx.log.warn("Invalid eCircuitMania API key");
      return;
    }

    try {
      const response = await this.ctx.http.fetch(
        `${ECM_URL}/${endpoint}?matchId=${encodeURIComponent(matchId)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: authToken,
          },
          body: JSON.stringify(body),
        },
      );
      if (response.status >= 400) {
        const details = {
          endpoint,
          status: response.status,
          body: response.body.slice(0, 500),
        };
        this.ctx.log.error("eCircuitMania request failed", details);
        this.ctx.captureException(
          new Error(`eCircuitMania ${endpoint} returned ${response.status}`),
          details,
        );
      }
    } catch (error) {
      this.ctx.log.error("eCircuitMania request failed", {
        endpoint,
        error: String(error),
      });
      // The match id and token stay out of the report
      this.ctx.captureException(error, { endpoint });
    }
  }

  private onFinish(waypoint: Waypoint) {
    if (!this.isActive()) return;
    void this.post("match-addRoundTime", {
      finishTime: waypoint.racetime,
      ubisoftUid: waypoint.accountid,
      roundNum: this.roundNum(),
      mapId: this.ctx.live.activeMapUid,
    });
  }

  private onScores(scores: Scores) {
    const type = this.ctx.live.liveInfo.type;
    // Reverse cup results are final before the round end animation
    const expectedSection = type === "reversecup" ? "PreEndRound" : "EndRound";
    if (scores.section !== expectedSection) return;
    if (!this.isActive()) return;

    const timeAttack = type === "timeattack";
    let players = scores.players;
    if (type === "reversecup") {
      players = players.filter((p) => p.matchpoints > -2000);
    }
    // Outside TA, drivers that neither finished nor started are not part of the round
    if (!timeAttack) {
      players = players.filter(
        (p) => p.prevracetime !== -1 || this.activeDrivers.has(p.login),
      );
    }

    void this.post("match-addRound", {
      players: rankPlayers(players, timeAttack).map((p) => ({
        finishTime: timeAttack ? p.bestracetime : p.prevracetime,
        ubisoftUid: p.accountid,
        position: p.position,
      })),
      roundNum: this.roundNum(),
      mapId: this.ctx.live.activeMapUid,
    });
  }

  private openWindow(login: string) {
    if (this.windows.has(login)) return;

    const window = this.ctx.ui.window({
      id: "ecm-window",
      component: (props) => <EcmWindow {...props} actions={this.actions} />,
      updateComponent: EcmWindowUpdate,
      login,
      title: "eCircuitMania",
      size: { x: WINDOW_SIZE[0], y: WINDOW_SIZE[1] },
      data: this.windowData(login),
      onClose: () => this.windows.delete(login),
    });

    this.windows.set(login, window);
    window.display();
  }

  private windowData(login: string): WindowView {
    const config = this.ctx.config();
    const editor = isEditor(config, login);
    return {
      isEditor: editor,
      apiKey: editor ? config.apiKey || "" : "",
      isRecording: config.isRecording || false,
      currentRound: this.roundNum(),
    };
  }

  private refreshWindows() {
    for (const [login, window] of this.windows) {
      window.setData(this.windowData(login));
      window.update();
    }
  }

  private canEdit(answer: ManialinkAnswer): boolean {
    return (
      this.windows.has(answer.login) &&
      isEditor(this.ctx.config(), answer.login)
    );
  }

  private async onToggleRecording(answer: ManialinkAnswer) {
    if (!this.canEdit(answer)) return;
    const config = this.ctx.config();
    await this.ctx.saveConfig({ ...config, isRecording: !config.isRecording });
    this.refreshWindows();
  }

  private async onSaveApiKey(answer: ManialinkAnswer) {
    if (!this.canEdit(answer)) return;
    const apiKey = answer.entries["ecm-api-key-entry"];
    if (!isValidEcmApiKey(apiKey)) return;

    await this.ctx.saveConfig({ ...this.ctx.config(), apiKey });
    this.refreshWindows();
  }

  private onRoundOffset(answer: ManialinkAnswer, delta: number) {
    if (!this.canEdit(answer)) return;
    this.roundOffset += delta;
    this.refreshWindows();
  }
}

export default definePlugin<Config>({
  create: (ctx) => new ECMPlugin(ctx),
});
