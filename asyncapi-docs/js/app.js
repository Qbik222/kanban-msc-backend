
    const schema = {
  "asyncapi": "2.6.0",
  "id": "urn:kanban:backend:realtime",
  "info": {
    "title": "Kanban Backend Realtime API",
    "version": "1.0.0",
    "description": "AsyncAPI specification for Socket.IO board events.\nFor quick usage and Swagger overview, see documentation.md.\n"
  },
  "defaultContentType": "application/json",
  "servers": {
    "local": {
      "url": "localhost:3000",
      "protocol": "socket.io",
      "description": "Local NestJS backend"
    }
  },
  "channels": {
    "joinBoard": {
      "description": "Client subscribes to updates for a specific board room.",
      "publish": {
        "summary": "Join board room",
        "operationId": "joinBoard",
        "message": {
          "name": "joinBoard",
          "title": "Join board room",
          "payload": {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "boardId"
            ],
            "properties": {
              "boardId": {
                "type": "string",
                "description": "MongoDB ObjectId of the board.",
                "examples": [
                  "65f0b3c3f2b7f6a1e9b1a001"
                ],
                "x-parser-schema-id": "<anonymous-schema-1>"
              }
            },
            "x-parser-schema-id": "BoardIdPayload"
          }
        }
      }
    },
    "boardUpdated": {
      "description": "Server event emitted after successful board rename (PATCH /boards/:id).",
      "subscribe": {
        "summary": "Board updated event",
        "operationId": "onBoardUpdated",
        "message": {
          "name": "board:updated",
          "title": "Board updated",
          "payload": "$ref:$.channels.joinBoard.publish.message.payload"
        }
      }
    },
    "boardDeleted": {
      "description": "Server event emitted after successful soft delete (DELETE /boards/:id).",
      "subscribe": {
        "summary": "Board deleted event",
        "operationId": "onBoardDeleted",
        "message": {
          "name": "board:deleted",
          "title": "Board deleted",
          "payload": "$ref:$.channels.joinBoard.publish.message.payload"
        }
      }
    }
  },
  "components": {
    "messages": {
      "JoinBoardMessage": "$ref:$.channels.joinBoard.publish.message",
      "BoardUpdatedMessage": "$ref:$.channels.boardUpdated.subscribe.message",
      "BoardDeletedMessage": "$ref:$.channels.boardDeleted.subscribe.message"
    },
    "schemas": {
      "BoardIdPayload": "$ref:$.channels.joinBoard.publish.message.payload"
    }
  },
  "x-parser-spec-parsed": true,
  "x-parser-api-version": 3,
  "x-parser-spec-stringified": true
};
    const config = {"show":{"sidebar":true},"sidebar":{"showOperations":"byDefault"}};
    const appRoot = document.getElementById('root');
    AsyncApiStandalone.render(
        { schema, config, }, appRoot
    );
  