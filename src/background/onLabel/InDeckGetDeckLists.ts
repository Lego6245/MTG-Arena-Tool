import LogEntry from "../../types/logDecoder";
import { getDeck } from "../../shared/store";
import { reduxAction } from "../../shared/redux/sharedRedux";
import globals from "../globals";
import {
  constants,
  convertDeckFromV3,
  ArenaV3Deck,
  InternalDeck,
} from "mtgatool-shared";

const { IPC_RENDERER } = constants;

interface Entry extends LogEntry {
  json: () => ArenaV3Deck[];
}

export default function InDeckGetDeckLists(
  entry: Entry,
  json: ArenaV3Deck[] = []
): void {
  if (json.length == 0 && entry) json = entry.json();
  if (json.length == 0) return;

  const decks: InternalDeck[] = [];
  json.forEach((deck) => {
    const deckData = { ...(getDeck(deck.id) || {}), ...deck };
    decks.push(convertDeckFromV3(deckData));
  });

  reduxAction(
    globals.store.dispatch,
    { type: "SET_MANY_STATIC_DECKS", arg: decks },
    IPC_RENDERER
  );
}
