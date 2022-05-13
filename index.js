// Created by @BatteryAcidDev

var aws = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const gameLiftClient = new aws.GameLift({ region: 'us-east-1' }); // YOUR REGION
const TARGET_GAMELIFT_QUEUE_NAME = "YOUR_TARGET_GAMELIFT_QUEUE_NAME";
const REQUEST_FIND_MATCH = "1";
const MAX_PLAYER_COUNT = 2; // This can be updated to suit your game's requirements

async function searchGameSessions(targetAliasARN) {
    var gameSessionFilterExpression = "hasAvailablePlayerSessions=true";

    var searchGameSessionsRequest = {
        AliasId: targetAliasARN,
        FilterExpression: gameSessionFilterExpression,
        SortExpression: "creationTimeMillis ASC"
    }

    return await gameLiftClient.searchGameSessions(searchGameSessionsRequest).promise().then(data => {
        // console.log(data);

        if (data.GameSessions && data.GameSessions.length > 0) {
            console.log("We have game sessions");
            return data.GameSessions[0]
        }
        else {
            console.log("No game sessions");
            return null;
        }
    }).catch(err => {
        console.log(err);
        return null;
    });
}

async function getActiveQueue() {
    var options = {
        "Limit": 5 // how many GameLift queues to return
    }
    
    return await gameLiftClient.describeGameSessionQueues(options).promise().then(data => {
        // console.log(data);
        
        if (data.GameSessionQueues && data.GameSessionQueues.length > 0) {
            // for now just grab the first Queue
            console.log("We have some queues");
            
            let selectedGameSessionQueue;
            data.GameSessionQueues.forEach(gameSessionQueue => {
                if (gameSessionQueue.Name == TARGET_GAMELIFT_QUEUE_NAME) {
                    selectedGameSessionQueue = gameSessionQueue;
                }
            });
            return selectedGameSessionQueue;
        }
        else {
            console.log("No queues available");
            return [];
        }
    }).catch(err => {
        console.log(err);
        return [];
    });
}

async function createGameSessionPlacement(targetQueueName, playerId) {
    var createSessionInQueueRequest = {
        GameSessionQueueName: targetQueueName,
        PlacementId: uuidv4(), // generate unique placement id
        MaximumPlayerSessionCount: MAX_PLAYER_COUNT,
        DesiredPlayerSessions: [{
            PlayerId: playerId   
        }]
    };
    console.log("Calling startGameSessionPlacement...");
    return await gameLiftClient.startGameSessionPlacement(createSessionInQueueRequest).promise().then(data => {
        // console.log(data);
        return data;
        
    }).catch(err => {
        console.log(err);
        return [];
    });
}

async function createPlayerSession(playerId, gameSessionId) {
    var createPlayerSessionRequest = {
      GameSessionId: gameSessionId,
      PlayerId: playerId
    };
    
    return await gameLiftClient.createPlayerSession(createPlayerSessionRequest).promise().then(data => {
        // console.log(data);
        return data;
    }).catch(err => {
        console.log(err);
        return null;
    });
    
}

exports.handler = async (event, context, callback) => {
    console.log("Inside function...");
    // console.log("environment: " + process.env.ENV);
    // console.log(JSON.stringify(event, null, 2));

    let message = JSON.parse(event.body);
    console.log("Message received: %j", message);
    
    let responseMsg = {};

    if (message && message.opCode) {

        switch (message.opCode) {
            case REQUEST_FIND_MATCH:
                console.log("Request find match opCode hit");

                var activeQueue = await getActiveQueue();
                // console.log(activeQueue);

                // The first destination is hardcoded here.  If you have more than one Alias or your setup is more complex, you’ll have to refactor. 
                var gameSession = await searchGameSessions(activeQueue.Destinations[0].DestinationArn);

                if (gameSession) {
                    console.log("We have a game session to join!");
                    // console.log(gameSession);
                    
                    console.log("Creating player session...");
                    var playerSession = await createPlayerSession(message.playerId, gameSession.GameSessionId);
                    console.log("Player session created");
                    // console.log(playerSession);
                    
                    responseMsg = playerSession.PlayerSession;
                    responseMsg.PlayerSessionStatus = playerSession.PlayerSession.Status;
                    responseMsg.GameSessionId = gameSession.GameSessionId;
                    responseMsg.GameSessionStatus = gameSession.Status;
                    
                }
                else {
                    console.log("No game sessions to join! " + activeQueue.Name);
                    var gameSessionPlacement = await createGameSessionPlacement(activeQueue.Name, message.playerId);
                    console.log("Game session placement request made");
                    // console.log(gameSessionPlacement.GameSessionPlacement);
                    responseMsg = gameSessionPlacement.GameSessionPlacement;
                }

                break;
        }
    }


    return callback(null, {
        statusCode: 200,
        body: JSON.stringify(
            responseMsg
        )
    });
};
