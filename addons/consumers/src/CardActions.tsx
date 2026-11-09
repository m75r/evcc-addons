// Slots einer Karte für die Anbieter von consumers.cardActions: mount, update und destroy je Anbieter
import type { JSX, RefObject } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type {
  CardActionContext,
  CardActionHandle,
  CardActionsProvider,
} from "./extension-contract.js";
import type { Texts } from "./i18n.js";
import { failureOf, type Claim, type ExtensionFailure, type ProviderEntry } from "./useClaims.js";

/** Eingehängter Anbieter mit eigenen Elementen in beiden Slots */
interface Mounted {
  addonId: string;
  handle: CardActionHandle | null;
  actions: HTMLElement;
  message: HTMLElement;
  /** Kontext des letzten mount/update als JSON */
  key: string;
  failure: ExtensionFailure | null;
}

type MountedMap = Map<CardActionsProvider, Mounted>;

function run(mounted: Mounted, action: () => void): void {
  try {
    action();
  } catch (err) {
    mounted.failure = failureOf(mounted.addonId, err);
  }
}

function mountOne(entry: ProviderEntry, ctx: CardActionContext, slots: SlotRefs): Mounted {
  const actions = document.createElement("span");
  const message = document.createElement("div");
  slots.actions.current?.append(actions);
  slots.message.current?.append(message);
  const key = JSON.stringify(ctx);
  const mounted: Mounted = {
    addonId: entry.addonId,
    handle: null,
    actions,
    message,
    key,
    failure: null,
  };
  run(mounted, () => (mounted.handle = entry.value.mount({ actions, message }, ctx)));
  return mounted;
}

function destroyOne(mounted: Mounted): ExtensionFailure | null {
  run(mounted, () => mounted.handle?.destroy());
  mounted.actions.remove();
  mounted.message.remove();
  return mounted.failure;
}

interface SlotRefs {
  actions: RefObject<HTMLDivElement | null>;
  message: RefObject<HTMLDivElement | null>;
}

/** Gleicht die eingehängten mit den beanspruchenden Anbietern ab; liefert die aktuellen Fehler */
function sync(map: MountedMap, claim: Claim, ctx: CardActionContext, slots: SlotRefs) {
  const failures: ExtensionFailure[] = [];
  const wanted = new Set(claim.providers.map((entry) => entry.value));
  for (const [provider, mounted] of map) {
    if (wanted.has(provider)) continue;
    map.delete(provider);
    const failure = destroyOne(mounted);
    if (failure) failures.push(failure);
  }
  const key = JSON.stringify(ctx);
  for (const entry of claim.providers) {
    const mounted = map.get(entry.value);
    if (!mounted) map.set(entry.value, mountOne(entry, ctx, slots));
    else if (mounted.key !== key && !mounted.failure) {
      mounted.key = key;
      run(mounted, () => mounted.handle?.update(ctx));
    }
  }
  return [...failures, ...[...map.values()].flatMap((m) => (m.failure ? [m.failure] : []))];
}

export interface CardActionSlotsView {
  /** Für den Kartenkopf; undefined ohne beanspruchenden Anbieter */
  actions: JSX.Element | undefined;
  /** Unter den Zeilen: Slots der Anbieter und Fehlermeldungen */
  message: JSX.Element;
}

export function useCardActions(
  claim: Claim,
  ctx: CardActionContext,
  t: Texts,
): CardActionSlotsView {
  const slots: SlotRefs = {
    actions: useRef<HTMLDivElement>(null),
    message: useRef<HTMLDivElement>(null),
  };
  const map = useRef<MountedMap>(new Map());
  const [failures, setFailures] = useState<ExtensionFailure[]>([]);
  useEffect(() => {
    const next = sync(map.current, claim, ctx, slots);
    setFailures((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  });
  useEffect(() => () => map.current.forEach((mounted) => destroyOne(mounted)), []);
  const errors = [...claim.errors, ...failures];
  return {
    actions:
      claim.providers.length > 0 ? (
        <div ref={slots.actions} class="evcc-consumers-slots" />
      ) : undefined,
    message: <CardMessage slot={slots.message} errors={errors} t={t} />,
  };
}

function CardMessage(props: {
  slot: RefObject<HTMLDivElement | null>;
  errors: ExtensionFailure[];
  t: Texts;
}) {
  return (
    <>
      <div ref={props.slot} />
      {props.errors.map((failure) => (
        <div
          key={failure.addonId}
          class="evcc-consumers-error"
          data-testid="consumer-extension-error"
        >
          {props.t.extensionError(failure.addonId, failure.message)}
        </div>
      ))}
    </>
  );
}
