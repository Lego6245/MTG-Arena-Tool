/*
globals
  actionLog,
  actionLogGenerateAbilityLink,
  actionLogGenerateLink,
  currentDeck,
  currentMatch,
  cloneDeep,
  changePriority,
  firstPass,
  forceDeckUpdate,
  gameStage,
  getNameBySeat,
  ipc,
  update_deck
*/

let actionType = [];
actionType[0] = "ActionType_None";
actionType[1] = "ActionType_Cast";
actionType[2] = "ActionType_Activate";
actionType[3] = "ActionType_Play";
actionType[4] = "ActionType_Activate_Mana";
actionType[5] = "ActionType_Pass";
actionType[6] = "ActionType_Activate_Test";
actionType[7] = "ActionType_Mode";
actionType[8] = "ActionType_Special_TurnFaceUp";
actionType[9] = "ActionType_ResolutionCost";
actionType[10] = "ActionType_CastLeft";
actionType[11] = "ActionType_CastRight";
actionType[12] = "ActionType_Make_Payment";
actionType[13] = "ActionType_CastingTimeOption";
actionType[14] = "ActionType_CombatCost";
actionType[15] = "ActionType_OpeningHandAction";

function keyValuePair(obj, addTo) {
  // I found some times we get f as the value array.. *shrug*
  if (obj.f) {
    addTo[obj.key] = obj.f[0];
    return addTo;
  }
  if (obj.type == "KeyValuePairValueType_None")
    addTo[obj.key] = obj.valueNone[0];
  if (obj.type == "KeyValuePairValueType_uint32")
    addTo[obj.key] = obj.valueUint32[0];
  if (obj.type == "KeyValuePairValueType_int32")
    addTo[obj.key] = obj.valueInt32[0];
  if (obj.type == "KeyValuePairValueType_uint64")
    addTo[obj.key] = obj.valueUint64[0];
  if (obj.type == "KeyValuePairValueType_int64")
    addTo[obj.key] = obj.valueInt64[0];
  if (obj.type == "KeyValuePairValueType_bool")
    addTo[obj.key] = obj.valueBool[0];
  if (obj.type == "KeyValuePairValueType_string")
    addTo[obj.key] = obj.valueString[0];
  if (obj.type == "KeyValuePairValueType_float")
    addTo[obj.key] = obj.valueFloat[0];
  if (obj.type == "KeyValuePairValueType_double")
    addTo[obj.key] = obj.valueDouble[0];
  return addTo;
}

function processAnnotations() {
  currentMatch.annotations.forEach((ann, index) => {
    // if this annotation has already been processed, skip
    if (currentMatch.processedAnnotations.includes(ann.id)) return;

    let details = {};
    if (ann.details) {
      ann.details.forEach(detail => (details = keyValuePair(detail, details)));
    }

    let processedOk = true;
    try {
      ann.type.forEach(type => {
        var fn = annotationFunctions[type];
        if (typeof fn == "function") {
          fn(ann, details);
        }
      });
    } catch (e) {
      //console.log(ann, e);
      processedOk = false;
    }

    if (processedOk) {
      //currentMatch.annotations = currentMatch.annotations.splice(index, 1);
      // add this annotation to the list of processed
      currentMatch.processedAnnotations.push(ann.id);
    }
  });
}

function removeProcessedAnnotations() {
  currentMatch.annotations = currentMatch.annotations.filter(
    ann => !currentMatch.processedAnnotations.includes(ann.id)
  );
}

let annotationFunctions = {};

annotationFunctions.AnnotationType_ObjectIdChanged = function(ann, details) {
  let newObj = cloneDeep(currentMatch.gameObjs[details.orig_id]);
  currentMatch.gameObjs[details.new_id] = newObj;

  idChanges[details.orig_id] = details.new_id;
};

annotationFunctions.AnnotationType_ZoneTransfer = function(ann, details) {
  // A player played a land
  if (details.category == "PlayLand") {
    let grpId = currentMatch.gameObjs[ann.affectedIds[0]].grpId;
    let playerName = getNameBySeat(ann.affectorId);
    actionLog(
      ann.affectorId,
      false,
      `${playerName} played ${actionLogGenerateLink(grpId)}`
    );
  }

  // A player drew a card
  if (details.category == "Draw") {
    let zone = currentMatch.zones[details.zone_src];
    let playerName = getNameBySeat(zone.ownerSeatId);
    if (zone.ownerSeatId == currentMatch.player.seat) {
      let grpId = currentMatch.gameObjs[ann.affectedIds[0]].grpId;
      actionLog(
        zone.ownerSeatId,
        false,
        `${playerName} drew ${actionLogGenerateLink(grpId)}`
      );
    } else {
      actionLog(zone.ownerSeatId, false, `${playerName} drew a card`);
    }
  }

  // A player casts a spell
  if (details.category == "CastSpell") {
    let obj = currentMatch.gameObjs[ann.affectedIds[0]];
    let grpId = obj.grpId;
    let seat = obj.ownerSeatId;
    let playerName = getNameBySeat(seat);
    actionLog(
      seat,
      false,
      `${playerName} casted ${actionLogGenerateLink(grpId)}`
    );
  }

  // A player discards a card
  if (details.category == "Discard") {
    let obj = currentMatch.gameObjs[ann.affectedIds[0]];
    let grpId = obj.grpId;
    let seat = obj.ownerSeatId;
    let playerName = getNameBySeat(seat);
    actionLog(
      seat,
      false,
      `${playerName} discarded ${actionLogGenerateLink(grpId)}`
    );
  }

  // A player puts a card in a zone
  if (details.category == "Put") {
    let zone = currentMatch.zones[details.zone_dest].type;
    let obj = currentMatch.gameObjs[ann.affectedIds[0]];
    let grpId = obj.grpId;
    let affector = currentMatch.gameObjs[ann.affectorId];
    let seat = obj.ownerSeatId;
    let text = getNameBySeat(seat);
    if (affector.type == "GameObjectType_Ability") {
      text = `${actionLogGenerateLink(
        affector.objectSourceGrpId
      )}'s ${actionLogGenerateAbilityLink(affector.grpId)}`;
    }
    if (affector.type == "GameObjectType_Card") {
      text = actionLogGenerateLink(affector.grpId);
    }
    actionLog(
      seat,
      false,
      `${text} put ${actionLogGenerateLink(grpId)} in ${zone}`
    );
  }

  // A card is returned to a zone
  if (details.category == "Return") {
    let zone = currentMatch.zones[details.zone_dest].type;
    let obj = currentMatch.gameObjs[ann.affectedIds[0]];
    let grpId = obj.grpId;
    let affector = currentMatch.gameObjs[ann.affectorId];
    let seat = obj.ownerSeatId;
    let text = getNameBySeat(seat);
    if (affector.type == "GameObjectType_Ability") {
      text = `${actionLogGenerateLink(
        affector.objectSourceGrpId
      )}'s ${actionLogGenerateAbilityLink(affector.grpId)}`;
    }
    if (affector.type == "GameObjectType_Card") {
      text = actionLogGenerateLink(affector.grpId);
    }
    actionLog(
      seat,
      false,
      `${text} returned ${actionLogGenerateLink(grpId)} to ${zone}`
    );
  }

  // A spell or ability counters something
  if (details.category == "Countered") {
    //
  }

  // A spell or ability destroys something
  if (details.category == "Destroy") {
    //
  }
};

annotationFunctions.AnnotationType_ResolutionStart = function(ann, details) {
  let affected = currentMatch.gameObjs[ann.affectedIds[0]];
  let grpId = details.grpid;

  if (affected.type == "GameObjectType_Ability") {
    actionLog(
      affected.controllerSeatId,
      false,
      `${actionLogGenerateLink(
        affected.objectSourceGrpId
      )} 's ${actionLogGenerateAbilityLink(grpId)}`
    );
  }
};

annotationFunctions.AnnotationType_TargetSpec = function(ann) {
  let obj = currentMatch.gameObjs[ann.affectedIds[0]];
  let grpId = obj.grpId;
  let affector = currentMatch.gameObjs[ann.affectorId];
  let seat = obj.ownerSeatId;
  let text = getNameBySeat(seat);
  if (affector.type == "GameObjectType_Ability") {
    text = `${actionLogGenerateLink(
      affector.objectSourceGrpId
    )}'s ${actionLogGenerateAbilityLink(affector.grpId)}`;
  }
  if (affector.type == "GameObjectType_Card") {
    text = actionLogGenerateLink(affector.grpId);
  }
  actionLog(seat, false, `${text} targetted ${actionLogGenerateLink(grpId)}`);
};

// Used for debug only.
function processAll() {
  for (var i = 0; i < currentMatch.latestMessage; i++) {
    let message = currentMatch.GREtoClient[i];
    if (message) {
      var fn = GREMessages[message.type];
      if (typeof fn == "function") {
        console.log(`Process: ${message.type} (${message.msgId})`);
        fn(message);
      }
    }
  }
  currentMatch.playerCardsUsed = getPlayerUsedCards();
  currentMatch.oppCardsUsed = getOppUsedCards();
}

let logTime;
function GREMessageByID(msgId, time) {
  let message = currentMatch.GREtoClient[msgId];
  logTime = time;

  var fn = GREMessages[message.type];
  if (typeof fn == "function") {
    fn(message);
  }

  currentMatch.playerCardsUsed = getPlayerUsedCards();
  currentMatch.oppCardsUsed = getOppUsedCards();
}

function GREMessage(message, time) {
  logTime = time;

  var fn = GREMessages[message.type];
  if (typeof fn == "function") {
    fn(message);
  }

  currentMatch.playerCardsUsed = getPlayerUsedCards();
  currentMatch.oppCardsUsed = getOppUsedCards();
}

function getOppUsedCards() {
  let cardsUsed = [];
  Object.keys(currentMatch.zones).forEach(key => {
    let zone = currentMatch.zones[key];
    if (zone.objectInstanceIds && zone.type != "ZoneType_Limbo") {
      zone.objectInstanceIds.forEach(id => {
        let grpId;
        try {
          let obj = currentMatch.gameObjs[id];
          if (
            obj.ownerSeatId == currentMatch.opponent.seat &&
            obj.type == "GameObjectType_Card"
          ) {
            grpId = obj.grpId;
            //cardsUsed.push(cardsDb.get(grpId).name+" - "+zone.type);
            cardsUsed.push(grpId);
          }
        } catch (e) {
          //
        }
      });
    }
  });
  return cardsUsed;
}

function getPlayerUsedCards() {
  let cardsUsed = [];
  Object.keys(currentMatch.zones).forEach(key => {
    let zone = currentMatch.zones[key];
    if (
      zone.objectInstanceIds &&
      zone.type != "ZoneType_Limbo" &&
      zone.type != "ZoneType_Revealed"
    ) {
      zone.objectInstanceIds.forEach(id => {
        let grpId;
        try {
          let obj = currentMatch.gameObjs[id];
          if (
            obj.ownerSeatId == currentMatch.player.seat &&
            obj.type == "GameObjectType_Card"
          ) {
            grpId = obj.grpId;
            //cardsUsed.push(cardsDb.get(grpId).name+" - "+zone.type);
            cardsUsed.push(grpId);
          }
        } catch (e) {
          //
        }
      });
    }
  });
  return cardsUsed;
}

let GREMessages = {};

GREMessages.GREMessageType_GameStateMessage = function(msg) {
  let gameState = msg.gameStateMessage;

  if (currentMatch.gameInfo) {
    checkGameInfo(currentMatch.gameInfo);
    currentMatch.gameInfo = gameState.gameInfo;
  }

  if (gameState.turnInfo) {
    checkTurnDiff(gameState.turnInfo);
    currentMatch.turnInfo = gameState.turnInfo;
  }

  if (gameState.timers) {
    gameState.timers.forEach(timer => {
      currentMatch.timers[timer.timerId] = timer;
    });
  }

  if (gameState.zones) {
    gameState.zones.forEach(zone => {
      currentMatch.zones[zone.zoneId] = zone;
    });
  }

  if (gameState.players) {
    gameState.players.forEach(player => {
      currentMatch.players[player.controllerSeatId] = player;
    });
  }

  if (gameState.gameObjects) {
    gameState.gameObjects.forEach(obj => {
      currentMatch.gameObjs[obj.instanceId] = obj;
      instanceToCardIdMap[obj.instanceId] = obj.grpId;
    });
  }

  if (gameState.annotations) {
    gameState.annotations.forEach(annotation => {
      currentMatch.annotations[annotation.id] = annotation;
    });
  }

  processAnnotations();
  removeProcessedAnnotations();
  checkForStartingLibrary();

  currentMatch.playerCardsLeft = currentMatch.player.deck.clone();
  forceDeckUpdate();
  update_deck(false);
  return true;
};

function checkForStartingLibrary() {
  let zoneHand, zoneLibrary;
  Object.keys(currentMatch.zones).forEach(key => {
    let zone = currentMatch.zones[key];
    if (zone.ownerSeatId == currentMatch.player.seat) {
      if (zone.type == "ZoneType_Hand") zoneHand = zone;
      if (zone.type == "ZoneType_Library") zoneLibrary = zone;
    }
  });

  if (gameStage != "GameStage_Start") return;
  if (!zoneHand.objectInstanceIds) return;
  if (!zoneLibrary.objectInstanceIds) return;

  let hand = zoneHand.objectInstanceIds || [];
  let library = zoneLibrary.objectInstanceIds || [];
  // Check that a post-mulligan scry hasn't been done
  if (library.length == 0 || library[library.length - 1] < library[0]) return;

  if (hand.length + library.length == currentDeck.mainboard.count()) {
    if (hand.length >= 2 && hand[0] == hand[1] + 1) hand.reverse();
    initialLibraryInstanceIds = [...hand, ...library];
  }
}

function checkGameInfo(gameInfo) {
  if (gameInfo.stage && gameInfo.stage != gameStage) {
    gameStage = gameInfo.stage;
    if (gameStage == "GameStage_Start") {
      initialLibraryInstanceIds = [];
      idChanges = {};
      instanceToCardIdMap = {};
    }
  }
  if (gameInfo.matchWinCondition) {
    if (gameInfo.matchWinCondition == "MatchWinCondition_SingleElimination") {
      currentMatch.bestOf = 1;
    } else if (gameInfo.matchWinCondition == "MatchWinCondition_Best2of3") {
      currentMatch.bestOf = 3;
    } else {
      currentMatch.bestOf = undefined;
    }
  }
}

function checkTurnDiff(turnInfo) {
  if (currentMatch.turnInfo.turnNumber !== turnInfo.turnNumber) {
    if (turnInfo.priorityPlayer !== currentMatch.turnInfo.currentPriority) {
      changePriority(
        turnInfo.priorityPlayer,
        currentMatch.turnInfo.currentPriority,
        logTime
      );
    }

    actionLog(
      -1,
      false,
      getNameBySeat(turnInfo.activePlayer) +
        "'s turn begin. (#" +
        turnInfo.turnNumber +
        ")"
    );
  }

  if (!firstPass) {
    ipc.send(
      "set_turn",
      currentMatch.player.seat,
      turnInfo.phase,
      turnInfo.step,
      turnInfo.turnNumber,
      turnInfo.activePlayer,
      turnInfo.priorityPlayer,
      turnInfo.decisionPlayer
    );
  }
}

GREMessages.GREMessageType_MulliganReq = function() {};

GREMessages.GREMessageType_ActionsAvailableReq = function() {};

GREMessages.GREMessageType_ChooseStartingPlayerReq = function() {};

GREMessages.GREMessageType_ConnectResp = function() {};

GREMessages.GREMessageType_MulliganReq = function() {};

GREMessages.GREMessageType_OrderReq = function() {};

GREMessages.GREMessageType_PromptReq = function() {};

GREMessages.GREMessageType_Revealhandreq = function() {};

GREMessages.GREMessageType_Selectnreq = function() {};
/*
GREMessages.GREMessageType_DeclareAttackersReq = function(msg) {
  msg.declareAttackersReq.attackers.forEach(attacker => {
    let obj = currentMatch.gameObjs[attacker.attackerInstanceId];
    let recipient = "";
    if (attacker.legalDamageRecipients) {
      if (attacker.legalDamageRecipients[0].type == "DamageRecType_Player") {
          recipient = getNameBySeat(
            attacker.legalDamageRecipients[0].playerSystemSeatId
          );
        }
        if (attacker.legalDamageRecipients[0].type == "DamageRecType_Planeswalker") {
          recipient = actionLogGenerateLink(
            attacker.legalDamageRecipients[0].planeswalkerinstanceid
          );
        }
    }
    else {
      if (attacker.selectedDamageRecipient.type == "DamageRecType_Player") {
        recipient = getNameBySeat(
          attacker.selectedDamageRecipient.playerSystemSeatId
        );
      }
      if (attacker.selectedDamageRecipient.type == "DamageRecType_Planeswalker") {
        recipient = actionLogGenerateLink(
          attacker.selectedDamageRecipient.planeswalkerinstanceid
        );
      }
    }
    actionLog(
      obj.controllerSeatId,
      false,
      `${actionLogGenerateLink(obj.grpId)} attacked ${recipient}`
    );
  });
};
*/

GREMessages.GREMessageType_Submitattackersresp = function() {};

GREMessages.GREMessageType_Declareblockersreq = function() {};

GREMessages.GREMessageType_Submitblockersresp = function() {};

GREMessages.GREMessageType_Assigndamagereq = function() {};

GREMessages.GREMessageType_Assigndamageconfirmation = function() {};

GREMessages.GREMessageType_Ordercombatdamagereq = function() {};

GREMessages.GREMessageType_Orderdamageconfirmation = function() {};

GREMessages.GREMessageType_Selecttargetsreq = function() {};

GREMessages.GREMessageType_Submittargetsresp = function() {};

GREMessages.GREMessageType_Paycostsreq = function() {};

GREMessages.GREMessageType_Intermissionreq = function() {};

GREMessages.GREMessageType_DieRollResultsResp = function(msg) {
  if (msg.dieRollResultsResp) {
    let highest = msg.dieRollResultsResp.playerDieRolls.reduce((a, b) => {
      if (a.rollValue > b.rollValue) {
        return a;
      } else {
        return b;
      }
    });
    currentMatch.onThePlay = highest.systemSeatId;
  }
  return true;
};

GREMessages.GREMessageType_Selectreplacementreq = function() {};

GREMessages.GREMessageType_Selectngroupreq = function() {};

GREMessages.GREMessageType_Alternativecostreq = function() {};

GREMessages.GREMessageType_Distributionreq = function() {};

GREMessages.GREMessageType_Numericinputreq = function() {};

GREMessages.GREMessageType_Searchreq = function() {};

GREMessages.GREMessageType_Optionalactionmessage = function() {};

GREMessages.GREMessageType_Castingtimeoptionsreq = function() {};

GREMessages.GREMessageType_Selectmanatypereq = function() {};

GREMessages.GREMessageType_Selectfromgroupsreq = function() {};

GREMessages.GREMessageType_Searchfromgroupsreq = function() {};

GREMessages.GREMessageType_Gatherreq = function() {};

GREMessages.GREMessageType_Queuedgamestatemessage = function() {};

GREMessages.GREMessageType_Uimessage = function() {};

GREMessages.GREMessageType_Submitdeckreq = function() {};

GREMessages.GREMessageType_Edictalmessage = function() {};

GREMessages.GREMessageType_Timeoutmessage = function() {};

module.exports = {
  GREMessage,
  processAll
};
