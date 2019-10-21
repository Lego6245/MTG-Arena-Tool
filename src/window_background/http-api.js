import electron from "electron";
import async from "async";
import qs from "qs";
import { makeId } from "../shared/util";
import { ipc_send, setData } from "./background-util";
import playerData from "../shared/player-data";
import db from "../shared/database";
import globals from "./globals";
import { loadPlayerConfig } from "./loadPlayerConfig";

let metadataState = false;

const httpAsync = [];

const serverAddress = "mtgatool.com";

function syncUserData(data) {
  console.log(data);
  // Sync Events
  const courses_index = [...playerData.courses_index];
  data.courses
    .filter(doc => !playerData.eventExists(doc._id))
    .forEach(doc => {
      const id = doc._id;
      doc.id = id;
      delete doc._id;
      courses_index.push(id);
      if (globals.debugLog || !globals.firstPass) globals.store.set(id, doc);
      setData({ [id]: doc }, false);
    });
  if (globals.debugLog || !globals.firstPass)
    globals.store.set("courses_index", courses_index);

  // Sync Matches
  const matches_index = [...playerData.matches_index];
  data.matches
    .filter(doc => !playerData.matchExists(doc._id))
    .forEach(doc => {
      const id = doc._id;
      doc.id = id;
      delete doc._id;
      matches_index.push(id);
      if (globals.debugLog || !globals.firstPass) globals.store.set(id, doc);
      setData({ [id]: doc }, false);
    });
  if (globals.debugLog || !globals.firstPass)
    globals.store.set("matches_index", matches_index);

  // Sync Economy
  const economy_index = [...playerData.economy_index];
  data.economy
    .filter(doc => !playerData.transactionExists(doc._id))
    .forEach(doc => {
      const id = doc._id;
      doc.id = id;
      delete doc._id;
      economy_index.push(id);
      if (globals.debugLog || !globals.firstPass) globals.store.set(id, doc);
      setData({ [id]: doc }, false);
    });
  if (globals.debugLog || !globals.firstPass)
    globals.store.set("economy_index", economy_index);

  // Sync Drafts
  const draft_index = [...playerData.draft_index];
  data.drafts
    .filter(doc => !playerData.draftExists(doc._id))
    .forEach(doc => {
      const id = doc._id;
      doc.id = id;
      delete doc._id;
      draft_index.push(id);
      if (globals.debugLog || !globals.firstPass) globals.store.set(id, doc);
      setData({ [id]: doc }, false);
    });
  if (globals.debugLog || !globals.firstPass)
    globals.store.set("draft_index", draft_index);

  // Sync seasonal
  data.seasonal.forEach(doc => {
    const id = doc._id;
    doc.id = id;
    delete doc._id;

    const seasonal_rank = playerData.addSeasonalRank(
      doc,
      doc.seasonOrdinal,
      doc.rankUpdateType
    );
    setData({ seasonal_rank });

    const seasonal = { ...playerData.seasonal, [id]: doc };
    setData({ seasonal });

    if (globals.debugLog || !globals.firstPass) {
      globals.store.set("seasonal." + id, doc);
      globals.store.set("seasonal_rank", seasonal_rank);
    }
  });

  if (data.settings.tags_colors) {
    const newTags = data.settings.tags_colors;
    setData({ tags_colors: { ...newTags } });
    globals.store.set("tags_colors", newTags);
  }

  setData({ courses_index, draft_index, economy_index, matches_index });
}

export function httpBasic() {
  const httpAsyncNew = httpAsync.slice(0);
  //var str = ""; httpAsync.forEach( function(h) {str += h.reqId+", "; }); console.log("httpAsync: ", str);
  async.forEachOfSeries(
    httpAsyncNew,
    function(value, index, callback) {
      const _headers = value;

      if (
        (playerData.settings.send_data == false ||
          playerData.offline == true) &&
        _headers.method != "auth" &&
        _headers.method != "delete_data" &&
        _headers.method != "get_database" &&
        globals.debugLog == false
      ) {
        if (!playerData.offline) setData({ offline: true });
        callback({
          message: "Settings dont allow sending data! > " + _headers.method
        });
        removeFromHttp(_headers.reqId);
        return;
      }

      _headers.token = globals.tokenAuth;

      const http = require("https");
      let options;
      if (_headers.method == "get_database") {
        options = {
          protocol: "https:",
          port: 443,
          hostname: serverAddress,
          path: "/database/" + _headers.lang,
          method: "GET"
        };
        ipc_send("popup", {
          text: "Downloading metadata...",
          time: 0,
          progress: 2
        });
      } else if (_headers.method == "get_ladder_decks") {
        options = {
          protocol: "https:",
          port: 443,
          hostname: serverAddress,
          path: "/top_ladder.json",
          method: "GET"
        };
      } else if (_headers.method == "get_ladder_traditional_decks") {
        options = {
          protocol: "https:",
          port: 443,
          hostname: serverAddress,
          path: "/top_ladder_traditional.json",
          method: "GET"
        };
      } else if (_headers.method_path !== undefined) {
        options = {
          protocol: "https:",
          port: 443,
          hostname: serverAddress,
          path: _headers.method_path,
          method: "POST"
        };
      } else {
        options = {
          protocol: "https:",
          port: 443,
          hostname: serverAddress,
          path: "/api.php",
          method: "POST"
        };
      }

      if (globals.debugNet && _headers.method !== "notifications") {
        console.log(
          "SEND >> " + index + ", " + _headers.method,
          _headers,
          options
        );
        ipc_send(
          "ipc_log",
          "SEND >> " +
            index +
            ", " +
            _headers.method +
            ", " +
            _headers.reqId +
            ", " +
            _headers.token
        );
      }

      // console.log("POST", _headers);
      const post_data = qs.stringify(_headers);
      options.headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": post_data.length
      };

      let results = "";
      const req = http.request(options, function(res) {
        if (res.statusCode < 200 || res.statusCode > 299) {
          ipc_send("popup", {
            text: `Error with request. (${_headers.method}: ${res.statusCode})`,
            time: 2000,
            progress: -1
          });
        } else {
          res.on("data", function(chunk) {
            results = results + chunk;
          });
          res.on("end", function() {
            if (globals.debugNet) {
              if (_headers.method !== "notifications") {
                ipc_send(
                  "ipc_log",
                  "RECV << " +
                    index +
                    ", " +
                    _headers.method +
                    ", " +
                    results.slice(0, 100)
                );
                console.log(
                  "RECV << " + index,
                  _headers.method,
                  _headers.method == "auth" ? results : results.slice(0, 500)
                );
              }
            }
            if (_headers.method == "notifications") {
              notificationSetTimeout();
            }
            try {
              let parsedResult = null;
              try {
                parsedResult = JSON.parse(results);
              } catch (e) {
                if (globals.debugNet) {
                  console.log(results);
                }
                ipc_send("popup", {
                  text: `Error parsing response. (${_headers.method})`,
                  time: 2000,
                  progress: -1
                });
              }

              if (_headers.method == "discord_unlink") {
                ipc_send("popup", {
                  text: "Unlink Ok",
                  time: 1000,
                  progress: -1
                });
                ipc_send("set_discord_tag", "");
              }
              if (_headers.method == "get_database_version") {
                const lang = playerData.settings.metadata_lang;
                if (
                  db.data.language &&
                  parsedResult.lang.toLowerCase() !==
                    db.data.language.toLowerCase()
                ) {
                  // compare language
                  console.log(
                    `Downloading database (had lang ${
                      db.data.language
                    }, needed ${parsedResult.lang})`
                  );
                  httpGetDatabase(lang);
                } else if (parsedResult.latest > db.version) {
                  // Compare parsedResult.version with stored version
                  console.log(
                    `Downloading latest database (had v${db.version}, found v${
                      parsedResult.latest
                    })`
                  );
                  httpGetDatabase(lang);
                } else {
                  console.log(
                    `Database up to date (${db.version}), skipping download.`
                  );
                }
              }
              if (_headers.method == "notifications") {
                notificationProcess(parsedResult);
              }
              if (_headers.method == "get_explore") {
                ipc_send("set_explore_decks", parsedResult);
              }
              if (_headers.method == "get_ladder_decks") {
                ipc_send("set_ladder_decks", parsedResult);
              }
              if (_headers.method == "get_ladder_traditional_decks") {
                ipc_send("set_ladder_traditional_decks", parsedResult);
              }
              if (parsedResult && parsedResult.ok) {
                if (_headers.method == "auth") {
                  globals.tokenAuth = parsedResult.token;

                  ipc_send("auth", parsedResult);
                  //ipc_send("auth", parsedResult.arenaids);
                  if (playerData.settings.remember_me) {
                    globals.rStore.set("token", globals.tokenAuth);
                    globals.rStore.set("email", playerData.userName);
                  }
                  const data = {};
                  data.patreon = parsedResult.patreon;
                  data.patreon_tier = parsedResult.patreon_tier;

                  const serverData = {
                    matches: [],
                    courses: [],
                    drafts: [],
                    economy: [],
                    seasonal: []
                  };
                  if (data.patreon) {
                    serverData.matches = parsedResult.matches;
                    serverData.courses = parsedResult.courses;
                    serverData.drafts = parsedResult.drafts;
                    serverData.economy = parsedResult.economy;
                    serverData.seasonal = parsedResult.seasonal;
                  }
                  setData(data, false);
                  loadPlayerConfig(playerData.arenaId);

                  const requestSync = {};
                  requestSync.courses = serverData.courses.filter(
                    id => !(id in playerData)
                  );
                  requestSync.matches = serverData.matches.filter(
                    id => !(id in playerData)
                  );
                  requestSync.drafts = serverData.drafts.filter(
                    id => !(id in playerData)
                  );
                  requestSync.economy = serverData.economy.filter(
                    id => !(id in playerData)
                  );
                  requestSync.seasonal = serverData.seasonal.filter(
                    id => !(id in playerData.seasonal)
                  );

                  const itemCount =
                    requestSync.courses.length +
                    requestSync.matches.length +
                    requestSync.drafts.length +
                    requestSync.economy.length +
                    requestSync.seasonal.length;

                  if (requestSync) {
                    ipc_send("ipc_log", "Fetch remote player items");
                    console.log(requestSync);
                    httpSyncRequest(requestSync);
                  } else {
                    ipc_send(
                      "ipc_log",
                      "No need to fetch remote player items."
                    );
                  }
                  ipc_send("set_discord_tag", parsedResult.discord_tag);
                  httpNotificationsPull();
                }
                if (
                  _headers.method == "tou_join" ||
                  _headers.method == "tou_drop"
                ) {
                  httpTournamentGet(parsedResult.id);
                }
                if (_headers.method == "get_top_decks") {
                  ipc_send("set_explore", parsedResult.result);
                }
                if (_headers.method == "get_course") {
                  ipc_send("open_course_deck", parsedResult.result);
                }
                if (_headers.method == "share_draft") {
                  ipc_send("set_draft_link", parsedResult.url);
                }
                if (_headers.method == "share_log") {
                  ipc_send("set_log_link", parsedResult.url);
                }
                if (_headers.method == "share_deck") {
                  ipc_send("set_deck_link", parsedResult.url);
                }
                if (_headers.method == "home_get") {
                  ipc_send("set_home", parsedResult);
                }
                if (_headers.method == "tou_get") {
                  ipc_send("tou_set", parsedResult.result);
                }
                if (_headers.method == "tou_check") {
                  //ipc_send("tou_set_game", parsedResult.result);
                }
                if (_headers.method == "get_sync") {
                  syncUserData(parsedResult.data);
                }

                if (_headers.method == "get_database") {
                  //resetLogLoop(100);
                  metadataState = true;
                  delete parsedResult.ok;
                  ipc_send("popup", {
                    text: "Metadata: Ok",
                    time: 1000,
                    progress: -1
                  });
                  db.handleSetDb(null, results);
                  db.updateCache(results);
                  ipc_send("set_db", results);
                  // autologin users may beat the metadata request
                  // manually trigger a UI refresh just in case
                  ipc_send("player_data_refresh");
                }
              } else if (_headers.method == "tou_join") {
                ipc_send("popup", {
                  text: parsedResult.error,
                  time: 10000
                });
              } else if (_headers.method == "tou_check") {
                const notif = new Notification("MTG Arena Tool", {
                  body: parsedResult.state
                });
                //ipc_send("popup", {"text": parsedResult.state, "time": 10000});
              } else if (
                parsedResult &&
                parsedResult.ok == false &&
                parsedResult.error != undefined
              ) {
                if (
                  _headers.method == "share_draft" ||
                  _headers.method == "share_log" ||
                  _headers.method == "share_deck"
                ) {
                  ipc_send("popup", {
                    text: parsedResult.error,
                    time: 3000
                  });
                }
                if (_headers.method == "auth") {
                  globals.tokenAuth = undefined;
                  globals.rStore.set("email", "");
                  globals.rStore.set("token", "");
                  ipc_send("auth", {});
                  ipc_send("toggle_login", true);
                  ipc_send("clear_pwd", 1);
                  ipc_send("popup", {
                    text: `Error: ${parsedResult.error}`,
                    time: 3000,
                    progress: -1
                  });
                }
                // errors here
              } else if (!parsedResult && _headers.method == "auth") {
                ipc_send("auth", {});
                ipc_send("popup", {
                  text: "Something went wrong, please try again",
                  time: 5000,
                  progress: -1
                });
              }
            } catch (e) {
              console.error(e);
            }
            try {
              callback();
            } catch (e) {
              //
            }

            removeFromHttp(_headers.reqId);
            if (globals.debugNet && _headers.method !== "notifications") {
              let str = "";
              httpAsync.forEach(function(h) {
                str += h.reqId + ", ";
              });
              ipc_send("ipc_log", "httpAsync: " + str);
            }
          });
        }
      });
      req.on("error", function(e) {
        console.error(`problem with request ${_headers.method}: ${e.message}`);
        console.log(req);
        ipc_send("popup", {
          text: `Request error. (${e.message})`,
          time: 0,
          progress: -1
        });

        callback(e);
        removeFromHttp(_headers.reqId);
        ipc_send("ipc_log", e.message);
      });
      req.write(post_data);
      // console.log(req);
      req.end();
    },
    function(err) {
      if (err) {
        ipc_send("ipc_log", "httpBasic() Error: " + err.message);
      }
      // do it again
      setTimeout(function() {
        httpBasic();
      }, 250);
    }
  );
}

function removeFromHttp(req) {
  httpAsync.forEach(function(h, i) {
    if (h.reqId == req) {
      httpAsync.splice(i, 1);
    }
  });
}

export function httpNotificationsPull() {
  const _id = makeId(6);
  httpAsync.push({
    reqId: _id,
    method: "notifications",
    method_path: "/api/pull.php"
  });
}

function notificationProcess(data) {
  if (!data) return;
  data.notifications.forEach(str => {
    console.log("notifications message:", str);
    if (typeof str == "string") {
      //console.log("Notification string:", str);
      new Notification("MTG Arena Tool", {
        body: str
      });
    } else if (typeof str == "object") {
      if (str.task) {
        if (str.task == "sync") {
          syncUserData(str.value);
        } else {
          ipc_send(str.task, str.value);
        }
      }
    }
  });
}

function notificationSetTimeout() {
  // Here we should probably do some "smarter" pull
  // Like, check if arena is open at all, if we are in a tourney, if we
  // just submitted some data that requires notification pull, etc
  // Based on that adjust the timeout for the next pull or call
  // this function again if no pull is required.
  setTimeout(httpNotificationsPull, 10000);
}

export function httpAuth(userName, pass) {
  const _id = makeId(6);
  setData({ userName }, false);
  httpAsync.push({
    reqId: _id,
    method: "auth",
    method_path: "/api/login.php",
    email: userName,
    password: pass,
    playerid: playerData.arenaId,
    playername: encodeURIComponent(playerData.name),
    mtgaversion: playerData.arenaVersion,
    version: electron.remote.app.getVersion()
  });
}

export function httpSubmitCourse(course) {
  const _id = makeId(6);
  if (playerData.settings.anon_explore == true) {
    course.PlayerId = "000000000000000";
    course.PlayerName = "Anonymous";
  }
  course.playerRank = playerData.rank.limited.rank;
  course = JSON.stringify(course);
  httpAsync.push({
    reqId: _id,
    method: "submit_course",
    method_path: "/api/send_course.php",
    course: course
  });
}

export function httpSetPlayer() {
  // useless I think
  //var _id = makeId(6);
  //httpAsync.push({'reqId': _id, 'method': 'set_player', 'name': name, 'rank': rank, 'tier': tier});
}

export function httpGetExplore(query) {
  const _id = makeId(6);
  httpAsync.unshift({
    reqId: _id,
    method: "get_explore",
    method_path: "/api/get_explore_v2.php",
    filter_wcc: query.filterWCC,
    filter_wcu: query.filterWCU,
    filter_wcr: query.filterWCR,
    filter_wcm: query.filterWCM,
    filter_owned: query.onlyOwned,
    filter_type: query.filterType,
    filter_event: query.filterEvent,
    filter_sort: query.filterSort,
    filter_sortdir: query.filterSortDir,
    filter_mana: query.filteredMana,
    filter_ranks: query.filteredranks,
    filter_skip: query.filterSkip,
    collection: JSON.stringify(playerData.cards.cards)
  });
}

export function httpGetTopLadderDecks() {
  const _id = makeId(6);
  httpAsync.unshift({
    reqId: _id,
    method: "get_ladder_decks",
    method_path: "/top_ladder.json"
  });
}

export function httpGetTopLadderTraditionalDecks() {
  const _id = makeId(6);
  httpAsync.push({
    reqId: _id,
    method: "get_ladder_traditional_decks",
    method_path: "/top_ladder_traditional.json"
  });
}

export function httpGetCourse(courseId) {
  const _id = makeId(6);
  httpAsync.unshift({
    reqId: _id,
    method: "get_course",
    method_path: "/api/get_course.php",
    courseid: courseId
  });
}

export function httpSetMatch(match) {
  const _id = makeId(6);
  if (playerData.settings.anon_explore == true) {
    match.player.userid = "000000000000000";
    match.player.name = "Anonymous";
  }
  match = JSON.stringify(match);
  httpAsync.push({
    reqId: _id,
    method: "set_match",
    method_path: "/api/send_match.php",
    match: match
  });
}

export function httpSetDraft(draft) {
  const _id = makeId(6);
  draft = JSON.stringify(draft);
  httpAsync.push({
    reqId: _id,
    method: "set_draft",
    method_path: "/api/send_draft.php",
    draft: draft
  });
}

export function httpSetEconomy(change) {
  const _id = makeId(6);
  change = JSON.stringify(change);
  httpAsync.push({
    reqId: _id,
    method: "set_economy",
    method_path: "/api/send_economy.php",
    change: change
  });
}

export function httpSetSeasonal(change) {
  const _id = makeId(6);
  change = JSON.stringify(change);
  httpAsync.push({
    reqId: _id,
    method: "set_seasonal",
    method_path: "/api/send_seasonal.php",
    change: change
  });
}

export function httpSetSettings(settings) {
  const _id = makeId(6);
  settings = JSON.stringify(settings);
  httpAsync.push({
    reqId: _id,
    method: "set_settings",
    method_path: "/api/send_settings.php",
    settings: settings
  });
}

export function httpDeleteData() {
  const _id = makeId(6);
  httpAsync.push({
    reqId: _id,
    method: "delete_data",
    method_path: "/api/delete_data.php"
  });
}

export function httpGetDatabase(lang) {
  const _id = makeId(6);
  httpAsync.push({ reqId: _id, method: "get_database", lang: lang });
}

export function httpGetDatabaseVersion(lang) {
  const _id = makeId(6);
  httpAsync.push({
    reqId: _id,
    method: "get_database_version",
    method_path: "/database/latest/" + lang
  });
}

export function httpDraftShareLink(did, exp, draftData) {
  const _id = makeId(6);
  httpAsync.push({
    reqId: _id,
    method: "share_draft",
    method_path: "/api/get_share_draft.php",
    id: did,
    draft: draftData,
    expire: exp
  });
}

export function httpLogShareLink(lid, log, exp) {
  const _id = makeId(6);
  httpAsync.push({
    reqId: _id,
    method: "share_log",
    method_path: "/api/get_share_log.php",
    id: lid,
    log: log,
    expire: exp
  });
}

export function httpDeckShareLink(deck, exp) {
  const _id = makeId(6);
  httpAsync.push({
    reqId: _id,
    method: "share_deck",
    method_path: "/api/get_share_deck.php",
    deck: deck,
    expire: exp
  });
}

export function httpHomeGet(set) {
  const _id = makeId(6);
  httpAsync.unshift({
    reqId: _id,
    method: "home_get",
    set: set,
    method_path: "/api/get_home.php"
  });
}

export function httpTournamentGet(tid) {
  const _id = makeId(6);
  httpAsync.unshift({
    reqId: _id,
    method: "tou_get",
    method_path: "/api/tournament_get.php",
    id: tid
  });
}

export function httpTournamentJoin(tid, _deck, pass) {
  const _id = makeId(6);
  const deck = JSON.stringify(playerData.deck(_deck));
  httpAsync.unshift({
    reqId: _id,
    method: "tou_join",
    method_path: "/api/tournament_join.php",
    id: tid,
    deck: deck,
    pass: pass
  });
}

export function httpTournamentDrop(tid) {
  const _id = makeId(6);
  httpAsync.unshift({
    reqId: _id,
    method: "tou_drop",
    method_path: "/api/tournament_drop.php",
    id: tid
  });
}

export function httpTournamentCheck(
  deck,
  opp,
  setCheck,
  bo3 = "",
  playFirst = ""
) {
  const _id = makeId(6);
  deck = JSON.stringify(deck);
  httpAsync.unshift({
    reqId: _id,
    method: "tou_check",
    method_path: "/api/check_match.php",
    deck: deck,
    opp: opp,
    setcheck: setCheck,
    bo3: bo3,
    play_first: playFirst
  });
}

export function httpSetMythicRank(opp, rank) {
  const _id = makeId(6);
  httpAsync.push({
    reqId: _id,
    method: "mythicrank",
    method_path: "/api/send_mythic_rank.php",
    opp: opp,
    rank: rank
  });
}

export function httpSetDeckTag(tag, cards, format) {
  const _id = makeId(6);
  cards.forEach(card => {
    card.quantity = 1;
  });
  cards = JSON.stringify(cards);
  httpAsync.push({
    reqId: _id,
    method: "set_deck_tag",
    method_path: "/api/send_deck_tag.php",
    tag: tag,
    cards: cards,
    format: format
  });
}

export function httpSyncRequest(data) {
  const _id = makeId(6);
  data = JSON.stringify(data);
  httpAsync.push({
    reqId: _id,
    method: "get_sync",
    method_path: "/api/get_sync.php",
    data: data
  });
}

export function httpDiscordUnlink() {
  const _id = makeId(6);
  httpAsync.unshift({
    reqId: _id,
    method: "discord_unlink",
    method_path: "/api/discord_unlink.php"
  });
}
