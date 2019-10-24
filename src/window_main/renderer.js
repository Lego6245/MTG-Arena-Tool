import { ipcRenderer as ipc, remote, shell } from "electron";
import sha1 from "js-sha1";
import { openNewGitHubIssue, debugInfo } from "electron-util";
import unhandled from "electron-unhandled";
import { init as sentryInit } from "@sentry/electron";

if (!remote.app.isPackaged) {
  unhandled({
    showDialog: true,
    reportButton: error => {
      openNewGitHubIssue({
        user: "Manuel-777",
        repo: "MTG-Arena-Tool",
        body: `\`\`\`\n${error.stack}\n\`\`\`\n\n---\n\n${debugInfo()}`
      });
    }
  });
  require("devtron").install();
  sentryInit({
    dsn: "https://4ec87bda1b064120a878eada5fc0b10f@sentry.io/1778171"
  });
}
import anime from "animejs";
import "time-elements";
import {
  DATE_SEASON,
  EASING_DEFAULT,
  HIDDEN_PW,
  MAIN_LOGIN,
  MAIN_HOME,
  MAIN_DECKS,
  MAIN_HISTORY,
  MAIN_EVENTS,
  MAIN_EXPLORE,
  MAIN_ECONOMY,
  MAIN_COLLECTION,
  MAIN_SETTINGS,
  MAIN_UPDATE,
  SETTINGS_ABOUT,
  SETTINGS_OVERLAY,
  SETTINGS_PRIVACY
} from "../shared/constants";
import pd from "../shared/player-data";
import { createDiv, queryElements as $$ } from "../shared/dom-fns";
import {
  compare_cards,
  get_deck_colors,
  get_rank_index,
  removeDuplicates,
  formatRank
} from "../shared/util";
import {
  changeBackground,
  getLocalState,
  hideLoadingBars,
  ipcSend,
  openDialog,
  pop,
  renderLogInput,
  resetMainContainer,
  setLocalState,
  showLoadingBars
} from "./renderer-util";
import Aggregator from "./aggregator";
import { openHomeTab, requestHome } from "./home";
import { tournamentOpen } from "./tournaments";
import { openDecksTab } from "./decks";
import { openDeck } from "./deck-details";
import { openHistoryTab } from "./history";
import { openEventsTab } from "./events";
import { openEconomyTab } from "./economy";
import { openExploreTab, setExploreDecks } from "./explore";
import { openCollectionTab } from "./collection";
import { openSettingsTab, setCurrentOverlaySettings } from "./settings";
import { showWhatsNew } from "./whats-new";

const byId = id => document.getElementById(id);
let sidebarActive = MAIN_LOGIN;
let loggedIn = false;
let canLogin = false;
let lastSettings = {};

//
ipc.on("clear_pwd", function() {
  byId("signin_pass").value = "";
});

//
ipc.on("auth", function(event, arg) {
  setLocalState({ authToken: arg.token });
  if (arg.ok) {
    $$(".message_center")[0].style.display = "flex";
    $$(".authenticate")[0].style.display = "none";
    loggedIn = true;
  } else {
    canLogin = true;
    ipcSend("renderer_show");
    pop(arg.error, -1);
  }
});

//
ipc.on("set_discord_tag", (event, arg) => {
  setLocalState({ discordTag: arg });
  if (sidebarActive === MAIN_HOME) {
    openHomeTab(null, true);
  }
});

//
ipc.on("too_slow", function() {
  pop(
    'Loading is taking too long, please read our <a class="trouble_link">troubleshooting guide</a>.',
    0
  );

  const popDiv = $$(".popup")[0];
  popDiv.style.left = "calc(50% - 280px)";
  popDiv.style.width = "560px";
  popDiv.style.pointerEvents = "all";

  $$(".trouble_link")[0].addEventListener("click", function() {
    shell.openExternal(
      "https://github.com/Manuel-777/MTG-Arena-Tool/blob/master/TROUBLESHOOTING.md"
    );
  });
});

//
ipc.on("show_login", () => {
  canLogin = true;
  showLogin();
});

//
function showLogin() {
  $$(".authenticate")[0].style.display = "block";
  $$(".message_center")[0].style.display = "none";
  $$(".init_loading")[0].style.display = "none";

  $$(".button_simple_disabled")[0].classList.add("button_simple");
  byId("signin_user").focus();
}

//
function updateNavIcons() {
  if ($$(".top_nav_icons")[0].offsetWidth < 530) {
    if (!top_compact) {
      $$("span.top_nav_item_text").forEach(el => (el.style.opacity = 0));
      $$(".top_nav_icon").forEach(el => (el.style.display = "block"));
      $$(".top_nav_icon").forEach(el => (el.style.opacity = 1));
      top_compact = true;
    }
  } else {
    if (top_compact) {
      $$("span.top_nav_item_text").forEach(el => (el.style.opacity = 1));
      $$(".top_nav_icon").forEach(el => (el.style.opacity = 0));
      window.setTimeout(() => {
        $$(".top_nav_icon").forEach(el => (el.style.display = "none"));
      }, 500);
      top_compact = false;
    }
  }
}

function updateTopBar() {
  updateNavIcons();

  if (pd.offline || !pd.settings.send_data) {
    $$(".unlink")[0].style.display = "block";
  }

  if (pd.name) {
    $$(".top_username")[0].innerHTML = pd.name.slice(0, -6);
    $$(".top_username_id")[0].innerHTML = pd.name.slice(-6);
  }

  if (pd.rank) {
    let rankOffset;
    const constructed = pd.rank.constructed;
    rankOffset = get_rank_index(constructed.rank, constructed.tier);
    const constructedRankIcon = $$(".top_constructed_rank")[0];
    constructedRankIcon.style.backgroundPosition = rankOffset * -48 + "px 0px";
    constructedRankIcon.setAttribute("title", formatRank(constructed));

    constructedRankIcon.innerHTML = constructed.leaderboardPlace
      ? formatRank(constructed).split(" ")[1]
      : "";

    const limited = pd.rank.limited;
    rankOffset = get_rank_index(limited.rank, limited.tier);
    const limitedRankIcon = $$(".top_limited_rank")[0];
    limitedRankIcon.style.backgroundPosition = rankOffset * -48 + "px 0px";
    limitedRankIcon.setAttribute("title", formatRank(limited));

    limitedRankIcon.innerHTML = limited.leaderboardPlace
      ? formatRank(limited).split(" ")[1]
      : "";
  }

  const patreonIcon = $$(".top_patreon")[0];
  if (pd.patreon) {
    const xoff = -40 * pd.patreon_tier;
    let title = "Patreon Basic Tier";

    if (pd.patreon_tier === 1) title = "Patreon Standard Tier";
    if (pd.patreon_tier === 2) title = "Patreon Modern Tier";
    if (pd.patreon_tier === 3) title = "Patreon Legacy Tier";
    if (pd.patreon_tier === 4) title = "Patreon Vintage Tier";

    patreonIcon.style.backgroundPosition = xoff + "px 0px";
    patreonIcon.setAttribute("title", title);
    patreonIcon.style.display = "block";
  } else {
    patreonIcon.style.display = "none";
  }
}

//
ipc.on("set_home", function(event, arg) {
  hideLoadingBars();

  if (sidebarActive === MAIN_HOME) {
    console.log("Home", arg);
    openHomeTab(arg);
  }
});

//
ipc.on("set_explore_decks", function(event, arg) {
  hideLoadingBars();
  if (sidebarActive === MAIN_EXPLORE) {
    setExploreDecks(arg);
  }
});

//
ipc.on("open_course_deck", function(event, arg) {
  anime({
    targets: ".moving_ux",
    left: "-100%",
    easing: EASING_DEFAULT,
    duration: 350
  });
  arg = arg.CourseDeck;
  arg.colors = get_deck_colors(arg);
  arg.mainDeck.sort(compare_cards);
  arg.sideboard.sort(compare_cards);
  // console.log(arg);

  arg.mainDeck = removeDuplicates(arg.mainDeck);
  arg.sideboard = removeDuplicates(arg.sideboard);
  openDeck(arg, null);
  hideLoadingBars();
});

//
ipc.on("settings_updated", function() {
  const cardQuantityWidth = Math.min(pd.cardsSizeHoverCard - 24, 180);

  $$(".hover_card_quantity")[0].style.left =
    cardQuantityWidth + (pd.cardsSizeHoverCard - cardQuantityWidth) / 2 + "px";
  $$(".hover_card_quantity")[0].style.width = cardQuantityWidth + "px";

  $$(".main_hover")[0].style.width = pd.cardsSizeHoverCard + "px";
  $$(".main_hover")[0].style.height =
    pd.cardsSizeHoverCard / 0.71808510638 + "px";

  $$(".main_hover_dfc")[0].style.width = pd.cardsSizeHoverCard + "px";
  $$(".main_hover_dfc")[0].style.height =
    pd.cardsSizeHoverCard / 0.71808510638 + "px";

  $$(".loader")[0].style.width = pd.cardsSizeHoverCard + "px";
  $$(".loader")[0].style.height = pd.cardsSizeHoverCard / 0.71808510638 + "px";

  $$(".loader_dfc")[0].style.width = pd.cardsSizeHoverCard + "px";
  $$(".loader_dfc")[0].style.height =
    pd.cardsSizeHoverCard / 0.71808510638 + "px";

  if (lastSettings.back_url !== pd.settings.back_url) {
    changeBackground();
  }
  $$(".main_wrapper")[0].style.backgroundColor = pd.settings.back_color;
  if (sidebarActive === MAIN_SETTINGS) {
    const ls = getLocalState();
    openSettingsTab(-1, ls.lastScrollTop);
  }
  lastSettings = { ...pd.settings };
});

let lastDataRefresh = null;

//
ipc.on("player_data_refresh", () => {
  // ignore signal before user login
  if (sidebarActive === MAIN_LOGIN) return;

  // limit refresh to one per second
  const ts = Date.now();
  const lastRefreshTooRecent = lastDataRefresh && ts - lastDataRefresh < 1000;
  if (lastRefreshTooRecent) return;

  const ls = getLocalState();
  updateTopBar();
  openTab(sidebarActive, {}, ls.lastDataIndex, ls.lastScrollTop);
  lastDataRefresh = ts;
});

//
ipc.on("set_update_state", function() {
  if (sidebarActive === MAIN_UPDATE) {
    openSettingsTab(SETTINGS_ABOUT);
  }
});

//
ipc.on("show_notification", function(event, arg) {
  const notification = $$(".notification")[0];
  notification.style.display = "block";
  notification.title = arg;

  if (arg === "Update available" || arg === "Update downloaded") {
    const handler = () => {
      force_open_about();
      notification.removeEventListener("click", handler);
    };
    notification.addEventListener("click", handler);
  }
});

//
ipc.on("hide_notification", function() {
  const notification = $$(".notification")[0];
  notification.style.display = "none";
  notification.title = "";
});

//
ipc.on("force_open_settings", function() {
  force_open_settings();
});

//
ipc.on("force_open_overlay_settings", function(event, arg) {
  setCurrentOverlaySettings(arg);
  force_open_settings(SETTINGS_OVERLAY);
});

//
ipc.on("force_open_about", function() {
  force_open_about();
});

//
ipc.on("force_open_tab", function(event, arg) {
  changeBackground("default");
  anime({
    targets: ".moving_ux",
    left: 0,
    easing: EASING_DEFAULT,
    duration: 350
  });
  $$(".top_nav_item").forEach(el => el.classList.remove("item_selected"));
  setLocalState({ lastDataIndex: 0, lastScrollTop: 0 });
  openTab(arg);
  ipcSend("save_user_settings", {
    last_open_tab: sidebarActive,
    skip_refresh: true
  });
});

//
ipc.on("prefill_auth_form", function(event, arg) {
  byId("rememberme").checked = arg.remember_me;
  byId("signin_user").value = arg.username;
  byId("signin_pass").value = arg.password;
});

let isNew = false;
//
ipc.on("show_whats_new", function() {
  isNew = true;
});

// this function is currently referenced in index.html
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function rememberMe() {
  const rSettings = {
    remember_me: byId("rememberme").checked
  };
  ipcSend("save_app_settings", rSettings);
}

//
function openTab(tab, filters = {}, dataIndex = 0, scrollTop = 0) {
  showLoadingBars();
  $$(".top_nav_item").forEach(el => el.classList.remove("item_selected"));
  let tabClass = "it" + tab;
  resetMainContainer();
  switch (tab) {
    case 0:
      openDecksTab(filters, scrollTop);
      break;
    case 1:
      openHistoryTab(filters, dataIndex, scrollTop);
      break;
    case 2:
      openEventsTab(filters, dataIndex, scrollTop);
      break;
    case 3:
      if (pd.offline) {
        showOfflineSplash();
      } else {
        openExploreTab();
      }
      break;
    case 4:
      openEconomyTab(dataIndex, scrollTop);
      break;
    case 5:
      openCollectionTab();
      break;
    case 6:
      tabClass = "ith";
      openSettingsTab(-1, scrollTop);
      break;
    case -1:
      tabClass = "ith";
      if (pd.offline) {
        showOfflineSplash();
      } else {
        if (getLocalState().discordTag === null) {
          openHomeTab(null, true);
        } else {
          requestHome();
        }
      }
      break;
    case -2:
    default:
      // $$(".message_center")[0].style.display = "initial";
      hideLoadingBars();
      $$(".init_loading")[0].style.display = "block";
      break;
  }
  if ($$("." + tabClass)[0])
    $$("." + tabClass)[0].classList.add("item_selected");
}

//
ipc.on("initialize", function() {
  showLoadingBars();
  updateTopBar();

  sidebarActive = pd.settings.last_open_tab;
  openTab(sidebarActive);

  if (isNew) {
    ipcSend("save_app_settings", {});
    setTimeout(() => {
      showWhatsNew();
    }, 1000);
  }

  $$(".top_nav")[0].classList.remove("hidden");
  $$(".overflow_ux")[0].classList.remove("hidden");
  $$(".message_center")[0].style.display = "none";
  $$(".init_loading")[0].style.display = "none";
});

//
let logDialogOpen = false;
ipc.on("no_log", function(event, arg) {
  if (loggedIn) {
    $$(".top_nav")[0].classList.add("hidden");
    $$(".overflow_ux")[0].classList.add("hidden");
    $$(".message_center")[0].style.display = "flex";
    $$(".message_center")[0].innerHTML =
      '<div class="message_big red">No Log Found</div><div class="message_sub_16 white">check if it exists at ' +
      arg +
      '</div><div class="message_sub_16 white">if it does, try closing MTG Arena and deleting it.</div>';
  } else if (!logDialogOpen) {
    logDialogOpen = true;
    const cont = createDiv(["dialog_content"]);
    cont.style.width = "650px";
    renderLogInput(cont);
    openDialog(cont, () => (logDialogOpen = false));
  }
});

//
ipc.on("offline", function() {
  showOfflineSplash();
});

//
function showOfflineSplash() {
  hideLoadingBars();
  byId("ux_0").innerHTML = `
  <div class="message_center_offline" style="display: flex; position: fixed;">
    <div class="message_unlink"></div>
    <div class="message_big red">Oops, you are offline!</div>
    <div class="message_sub_16 white">To access online features:</div>
    <div class="message_sub_16 white">If you are logged in, you may need to <a class="privacy_link">enable online sharing</a> and restart.</div>
    <div class="message_sub_16 white">If you are in offline mode, you can <a class="launch_login_link">login to your account</a>.</div>
    <div class="message_sub_16 white">If you need an account, you can <a class="signup_link">sign up here</a>.</div>
  </div>`;
  $$(".privacy_link")[0].addEventListener("click", function() {
    force_open_settings(SETTINGS_PRIVACY);
  });
  $$(".launch_login_link")[0].addEventListener("click", function() {
    const clearAppSettings = {
      remember_me: false,
      auto_login: false,
      launch_to_tray: false
    };
    ipcSend("save_app_settings", clearAppSettings);
    remote.app.relaunch();
    remote.app.exit(0);
  });
  $$(".signup_link")[0].addEventListener("click", function() {
    shell.openExternal("https://mtgatool.com/signup/");
  });
}

//
ipc.on("log_read", function() {
  $$(".top_nav")[0].classList.remove("hidden");
  $$(".overflow_ux")[0].classList.remove("hidden");
  $$(".message_center")[0].style.display = "none";
  $$(".init_loading")[0].style.display = "none";
});

//
ipc.on("popup", function(event, arg, time) {
  pop(arg, time);
});

//
function force_open_settings(section = -1) {
  sidebarActive = MAIN_SETTINGS;
  anime({
    targets: ".moving_ux",
    left: 0,
    easing: EASING_DEFAULT,
    duration: 350
  });
  $$(".top_nav_item").forEach(el => el.classList.remove("item_selected"));
  openSettingsTab(section, 0);
}

//
function force_open_about() {
  sidebarActive = MAIN_UPDATE;
  anime({
    targets: ".moving_ux",
    left: 0,
    easing: EASING_DEFAULT,
    duration: 350
  });
  $$(".top_nav_item").forEach(el => el.classList.remove("item_selected"));
  openSettingsTab(SETTINGS_ABOUT, 0);
}

//
let top_compact = false;
let resizeTimer;
window.addEventListener("resize", () => {
  hideLoadingBars();
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(updateNavIcons, 100);
});

function ready(fn) {
  if (
    document.attachEvent
      ? document.readyState === "complete"
      : document.readyState !== "loading"
  ) {
    fn();
  } else {
    document.addEventListener("DOMContentLoaded", fn);
  }
}

ipc.on("toggle_login", (event, arg) => {
  loginToggle(arg);
});

function loginToggle(toggle) {
  if (toggle) {
    canLogin = true;
    $$(".login_link")[0].classList.remove("disabled");
  } else {
    canLogin = false;
    $$(".login_link")[0].classList.add("disabled");
  }
}

ready(function() {
  $$(".version_number")[0].innerHTML = `v${remote.app.getVersion()}`;

  $$(".version_number")[0].addEventListener("click", function() {
    force_open_settings(SETTINGS_ABOUT);
  });

  $$(".signup_link")[0].addEventListener("click", function() {
    shell.openExternal("https://mtgatool.com/signup/");
  });

  $$(".offline_link")[0].addEventListener("click", function() {
    ipcSend("login", { username: "", password: "" });
  });

  $$(".forgot_link")[0].addEventListener("click", function() {
    shell.openExternal("https://mtgatool.com/resetpassword/");
  });

  function submitAuthenticateForm() {
    if (canLogin) {
      const user = byId("signin_user").value;
      let pass = byId("signin_pass").value;
      if (pass !== HIDDEN_PW) {
        pass = sha1(pass);
      }
      ipcSend("login", { username: user, password: pass });
      loginToggle(false);
    }
  }

  $$("#authenticate_form")[0].addEventListener("submit", e => {
    e.preventDefault();
    submitAuthenticateForm();
  });

  $$(".login_link")[0].addEventListener("click", submitAuthenticateForm);

  //
  $$(".close")[0].addEventListener("click", function() {
    ipcSend("renderer_window_close", 1);
  });

  //
  $$(".minimize")[0].addEventListener("click", function() {
    ipcSend("renderer_window_minimize", 1);
  });

  //
  $$(".settings")[0].addEventListener("click", function() {
    force_open_settings();
  });

  //
  $$(".top_nav_item").forEach(el => {
    el.addEventListener("click", function() {
      changeBackground("default");
      document.body.style.cursor = "auto";
      const classList = [...this.classList];
      if (!classList.includes("item_selected")) {
        anime({
          targets: ".moving_ux",
          left: 0,
          easing: EASING_DEFAULT,
          duration: 350
        });
        let filters = { date: pd.settings.last_date_filter };
        if (classList.includes("ith")) {
          sidebarActive = MAIN_HOME;
        } else if (classList.includes("it0")) {
          sidebarActive = MAIN_DECKS;
        } else if (classList.includes("it1")) {
          sidebarActive = MAIN_HISTORY;
        } else if (classList.includes("it2")) {
          sidebarActive = MAIN_EVENTS;
        } else if (classList.includes("it3")) {
          sidebarActive = MAIN_EXPLORE;
        } else if (classList.includes("it4")) {
          sidebarActive = MAIN_ECONOMY;
        } else if (classList.includes("it5")) {
          sidebarActive = MAIN_COLLECTION;
        } else if (classList.includes("it6")) {
          sidebarActive = MAIN_SETTINGS;
        } else if (classList.includes("it7")) {
          sidebarActive = MAIN_HISTORY;
          filters = {
            ...Aggregator.getDefaultFilters(),
            date: DATE_SEASON,
            eventId: Aggregator.RANKED_CONST,
            rankedMode: true
          };
        } else if (classList.includes("it8")) {
          sidebarActive = MAIN_HISTORY;
          filters = {
            ...Aggregator.getDefaultFilters(),
            date: DATE_SEASON,
            eventId: Aggregator.RANKED_DRAFT,
            rankedMode: true
          };
        }
        setLocalState({ lastDataIndex: 0, lastScrollTop: 0 });
        openTab(sidebarActive, filters);
        ipcSend("save_user_settings", {
          last_open_tab: sidebarActive,
          last_date_filter: filters.date,
          skip_refresh: true
        });
      } else {
        anime({
          targets: ".moving_ux",
          left: 0,
          easing: EASING_DEFAULT,
          duration: 350
        });
      }
    });
  });
});

//
//ipc.on("show_loading", () => showLoadingBars());

//
//ipc.on("hide_loading", () => hideLoadingBars());

//
ipc.on("set_draft_link", function(event, arg) {
  hideLoadingBars();
  byId("share_input").value = arg;
});

//
ipc.on("set_log_link", function(event, arg) {
  hideLoadingBars();
  byId("share_input").value = arg;
});

//
ipc.on("set_deck_link", function(event, arg) {
  hideLoadingBars();
  byId("share_input").value = arg;
});

//
ipc.on("tou_set", function(event, arg) {
  document.body.style.cursor = "auto";
  tournamentOpen(arg);
  anime({
    targets: ".moving_ux",
    left: "-100%",
    easing: EASING_DEFAULT,
    duration: 350
  });
});
