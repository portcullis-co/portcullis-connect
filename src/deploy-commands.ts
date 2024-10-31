import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import * as dotenv from 'dotenv';
dotenv.config();

const commands = [
  new SlashCommandBuilder()
    .setName('setup-portal')
    .setDescription('Start the portal setup process'),

  new SlashCommandBuilder()
    .setName('create-user')
    .setDescription('Create a new user in Clerk')
    .addStringOption(option =>
      option.setName('email')
      .setDescription('User email address')
      .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('first_name')
      .setDescription('First name')
      .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('last_name')
      .setDescription('Last name')
      .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('domain')
      .setDescription('User domain')
      .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('organization')
      .setDescription('Organization name (optional)')
      .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('create-customer')
    .setDescription('Create a new customer in Hyperline')
    .addStringOption(option =>
      option.setName('name')
      .setDescription('Customer legal name')
      .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('email')
      .setDescription('Billing email address')
      .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('organization_id')
      .setDescription('Clerk Organization ID')
      .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('type')
      .setDescription('Customer type')
      .addChoices(
        { name: 'Corporate', value: 'corporate' },
        { name: 'Person', value: 'person' }
      )
      .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('currency')
      .setDescription('Currency code')
      .addChoices(
        { name: 'USD', value: 'USD' },
        { name: 'EUR', value: 'EUR' },
        { name: 'GBP', value: 'GBP' }
      )
      .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('create-quote')
    .setDescription('Create a quote for a customer')
    .addStringOption(option =>
      option.setName('customer_id')
      .setDescription('Hyperline Customer ID')
      .setRequired(true)
    )
    .addNumberOption(option =>
      option.setName('amount')
      .setDescription('Quote amount in cents')
      .setRequired(true)
    )
    .addStringOption(option =>
      option.setName('currency')
      .setDescription('Currency code')
      .addChoices(
        { name: 'USD', value: 'USD' },
        { name: 'EUR', value: 'EUR' },
        { name: 'GBP', value: 'GBP' }
      )
      .setRequired(true)
    )
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN!);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID!),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
})();