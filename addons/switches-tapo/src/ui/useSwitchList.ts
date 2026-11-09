// Zustand des SwitchListStore als Preact-State; das Abo hält das Neuladen im Takt am Laufen
import { useEffect, useState } from "preact/hooks";
import type { SwitchListState, SwitchListStore } from "../switch-list.js";

export function useSwitchList(store: SwitchListStore): SwitchListState {
  const [state, setState] = useState(() => store.current());
  useEffect(() => store.subscribe(() => setState(store.current())), [store]);
  return state;
}
