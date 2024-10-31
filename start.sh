#!/bin/bash

# Deploy commands first
node dist/deploy-commands.js

# Start the bot
node dist/bot.js 