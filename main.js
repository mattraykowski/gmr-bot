var request = require('request');
var repl = require('repl');
var _ = require('lodash');
var Config = require('./config.js');

var GMR_API_URL = 'http://multiplayerrobot.com/api/Diplomacy/AuthenticateUser?authKey=';

var Slack = require('node-slack');
var slack = new Slack(Config.SLACK_HOOK);

function getSlackName(playerId) {
  return '@'+Config.PLAYERS_TO_SLACK[playerId];
}
function getNextPlayer(game) {
  var player = _.find(game.Players, { TurnOrder: game.CurrentTurn.PlayerNumber+1});
  if(typeof player === 'undefined') {
    player = _.find(game.Players, { TurnOrder: 0 });
  }
  return player;
}

var runner = (function() {
  var timer;
  var lastPlayer;
  var lastReminder = new Date();

  return {
    start: start,
    stop: stop
  };

  function start() {
    timer = setInterval(checkTurn, 30000);
  }

  function checkTurn() {
    fetch(function(game) {
      var currently = new Date();
      var seconds = (currently - lastReminder) /  60000;
      // If the current player changed, or the reminder period elapsed.
      if(game.CurrentTurn.UserId !== lastPlayer || seconds > 3600) {
        lastPlayer = game.CurrentTurn.UserId;
        sendSlackNotice(game);
      }
    });
  }

  function stop() {
    clearInterval(timer);
  }
})();
var channel = Config.GMR_CHANNEL;
function changeChannel(channelName) {
  channel = channelName;
}

var gmr = repl.start('gmr > ');
gmr.context.fetchOnce = fetch;
gmr.context.changeChannel = changeChannel;
gmr.context.channel = function() { return channel; };
gmr.context.start = runner.start;
gmr.context.stop = runner.stop;

//slack.send({
//  text: 'testing.',
//  channel: '#test',
//  username: 'GMR_Bot'
//});

// http://multiplayerrobot.com/api/Diplomacy/GetGamesAndPlayers?playerIDText=[playerId1_playerId2_playerId3...]&authKey=[user authKey]
// fetch();

function fetch(cb) {
  var playerIDText = Object.keys(Config.PLAYERS_TO_SLACK).join('_');
  request('http://multiplayerrobot.com/api/Diplomacy/GetGamesAndPlayers?playerIDText='+playerIDText+'&authKey=' + Config.GMR_AUTH_KEY,
    function(error, response, body) {
      var gmrBody = JSON.parse(body);
      _.each(gmrBody.Games, function(game) {
        if(typeof cb === 'undefined') {
          sendSlackNotice(game);
        } else {
          cb(game);
        }
      });
    });
}

function sendSlackNotice(game) {
  slack.send({
    text: 'Giant Multiplayer Robot',
    attachments: [
      {
        fallback: game.Name + ': ' + getSlackName(game.CurrentTurn.UserId) + ' is up.',
        title: game.Name + ': ' + getSlackName(game.CurrentTurn.UserId) + ' is up.',
        title_link: 'http://multiplayerrobot.com/Game#' + game.GameId,
        text: 'There have been ' + game.CurrentTurn.Number + ' turns so far.',
        fields: [
          {
            title: 'Next Up',
            value: getSlackName(getNextPlayer(game).UserId)
          }
        ]
      }
    ],
    channel: channel,
    icon_emoji: ':city_sunrise:',
    username: 'GMR_Bot'
  });
}
