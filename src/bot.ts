import * as dotenv from 'dotenv';
dotenv.config();

import { 
  Client, 
  GatewayIntentBits, 
  Events,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  GuildMemberRoleManager,
} from 'discord.js';

import { createClerkUser, createHyperlineQuote, upsertUserToSupabase, createHyperlineCustomer } from './utils/customers';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, () => {
  console.log(`Logged in as ${client.user?.tag}!`);
});

client.on(Events.InteractionCreate, async interaction => {
  try {
    if (interaction.isCommand() && interaction.commandName === 'setup-portal') {
      const welcomeEmbed = new EmbedBuilder()
        .setTitle('Welcome to Portcullis')
        .setDescription('Access your data export tools and magic links through our client portal.')
        .setColor(0x0099FF);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('register-client')
            .setLabel('Register')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('📝')
        );

      await interaction.reply({
        embeds: [welcomeEmbed],
        components: [row],
        ephemeral: true
      });
    }

    if (interaction.isButton() && interaction.customId === 'register-client') {
      try {
        const modal = new ModalBuilder()
          .setCustomId('client-registration-form')
          .setTitle('Client Registration');

        const firstNameInput = new TextInputBuilder()
          .setCustomId('firstName')
          .setLabel('First Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const lastNameInput = new TextInputBuilder()
          .setCustomId('lastName')
          .setLabel('Last Name')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const organizationInput = new TextInputBuilder()
          .setCustomId('organization')
          .setLabel('Organization')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const domainInput = new TextInputBuilder()
          .setCustomId('domain')
          .setLabel('Domain')
          .setPlaceholder('e.g. runportcullis.co')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const useCaseInput = new TextInputBuilder()
          .setCustomId('useCase')
          .setLabel('Data Export Use Case')
          .setPlaceholder('e.g. Industrial, Financial, Healthcare, etc.')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(firstNameInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(lastNameInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(organizationInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(domainInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(useCaseInput)
        );

        await interaction.showModal(modal);
      } catch (error) {
        console.error('Error showing modal:', error);
        await interaction.reply({ content: 'Error showing registration form', ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'client-registration-form') {
      await interaction.deferReply({ ephemeral: true });
      
      const firstName = interaction.fields.getTextInputValue('firstName');
      const lastName = interaction.fields.getTextInputValue('lastName');
      const organization = interaction.fields.getTextInputValue('organization');
      const domain = interaction.fields.getTextInputValue('domain');
      const useCase = interaction.fields.getTextInputValue('useCase');

      try {
        // Create role for domain if it doesn't exist
        let role = interaction.guild?.roles.cache.find(r => r.name === domain);
        if (!role) {
          const color = '#030303';
          const logo = `https://img.logo.dev/${domain}?token=pk_Bm3yO9a1RZumHNuIQJtxqg`;
          role = await interaction.guild?.roles.create({
            name: domain,
            color: color,
            reason: 'New client domain role'
          });
        }

        // Create private channel
        const channelName = `${organization.toLowerCase().replace(/[^a-z0-9]/g, '-')}-welcome`;
        const channel = await interaction.guild?.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: role?.id!,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            },
            {
              id: '1300607564517474445',
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            },
            {
              id: client.user?.id ?? interaction.guild.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ManageChannels
              ]
            }
          ]
        });

        // Assign role to user
        if (role && interaction.member?.roles instanceof GuildMemberRoleManager) {
          await interaction.member.roles.add(role);
        }

        // Send welcome message in new channel
        await channel?.send({
          embeds: [{
            title: `Welcome ${firstName} ${lastName}!`,
            description: `Thank you for registering with Portcullis.\n\n**Organization:** ${organization}\n**Domain:** ${domain}\n**Data Warehouse Info:** ${useCase}`,
            color: role?.color
          }]
        });

        // Confirm to user
        await interaction.editReply({
          content: `Registration complete! Please check ${channel}`,
          components: []
        });

      } catch (error) {
        console.error(error);
        await interaction.editReply({
          content: 'There was an error processing your registration. Please try again.'
        });
      }
    }

    if (interaction.isCommand() && interaction.commandName === 'create-user') {
      try {
        await interaction.deferReply({ ephemeral: true });
        
        const email = interaction.options.get('email')?.value as string;
        const firstName = interaction.options.get('first_name')?.value as string;
        const lastName = interaction.options.get('last_name')?.value as string;
        const domain = interaction.options.get('domain')?.value as string;
        const organizationName = interaction.options.get('organization')?.value as string;
        
        try {
          const result = await createClerkUser(
            email,
            interaction.user.id,
            firstName,
            lastName,
            domain,
            organizationName
          );
          
          await interaction.editReply({
            content: `✅ User created successfully!
Email: ${email}
Name: ${firstName} ${lastName}
Clerk ID: ${result.user.id}
${result.organization ? `Organization ID: ${result.organization.id}` : ''}
${result.organization ? `API Key: ${result.organization.publicMetadata?.apiKey}` : ''}`
          });
        } catch (error: any) {
          if (error.clerkError && error.status === 422) {
            await interaction.editReply({
              content: `❌ ${error.errors[0].message}`
            });
          } else {
            console.error('Error creating user:', error);
            await interaction.editReply({
              content: 'There was an error creating the user. Please try again.'
            });
          }
        }
      } catch (error) {
        console.error('Interaction error:', error);
      }
    }

    if (interaction.isCommand() && interaction.commandName === 'create-quote') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const customerId = interaction.options.get('customer_id')?.value as string;
        const amount = interaction.options.get('amount')?.value as number;
        const currency = interaction.options.get('currency')?.value as string;
        
        const quote = await createHyperlineQuote({
          customer_id: customerId,
          amount: amount,
          currency: currency
        });

        const embed = new EmbedBuilder()
          .setTitle('Quote Created')
          .setDescription(`A new quote has been created for customer ${customerId}`)
          .addFields(
            { name: 'Amount', value: `${(amount/100).toFixed(2)} ${currency.toUpperCase()}`, inline: true },
            { name: 'Status', value: quote.status, inline: true },
            { name: 'Quote URL', value: quote.hosted_url || 'Not available' }
          )
          .setColor(0x0099FF);

        await interaction.editReply({
          embeds: [embed]
        });

      } catch (error) {
        console.error('Error creating quote:', error);
        await interaction.editReply({
          content: 'There was an error creating the quote. Please try again.'
        });
      }
    }

    if (interaction.isCommand() && interaction.commandName === 'create-customer') {
      await interaction.deferReply({ ephemeral: true });
      try {
        const name = interaction.options.get('name')?.value as string;
        const type = interaction.options.get('type')?.value as 'corporate' | 'person';
        const currency = interaction.options.get('currency')?.value as string;
        const email = interaction.options.get('email')?.value as string;
        const organizationId = interaction.options.get('organization_id')?.value as string;
        
        const customer = await createHyperlineCustomer({
          name,
          type,
          currency,
          billing_email: email,
          organization_id: organizationId
        });

        // Check if customer.id exists before creating embed
        if (!customer.id) {
          throw new Error('Failed to create customer: No customer ID returned');
        }

        const embed = new EmbedBuilder()
          .setTitle('Customer Created')
          .setDescription(`A new Hyperline customer has been created`)
          .addFields([  // Wrap fields in an array
            { name: 'Name', value: name || 'N/A', inline: true },
            { name: 'Type', value: type || 'N/A', inline: true },
            { name: 'Customer ID', value: customer.id || 'N/A', inline: true },
            { name: 'Organization ID', value: organizationId || 'N/A' }
          ])
          .setColor(0x0099FF);

        await interaction.editReply({
          embeds: [embed]
        });

      } catch (error) {
        console.error('Error creating customer:', error);
        // Only send error reply if interaction hasn't been acknowledged
        if (!interaction.replied) {
          await interaction.editReply({
            content: 'There was an error creating the customer. Please try again.'
          });
        }
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    try {
      if (interaction.isRepliable() && !interaction.replied) {
        await interaction.reply({ 
          content: 'There was an error processing your request.', 
          ephemeral: true 
        });
      }
    } catch (e) {
      console.error('Error sending error message:', e);
    }
  }
});

client.on(Events.GuildMemberAdd, async member => {
  try {
    const welcomeEmbed = new EmbedBuilder()
      .setTitle('Welcome to the Portcullis Hub!')
      .setDescription("We're super excited you're thinking about exploring Portcullis at your organization, and we'd love to learn more about your intended use case for data exports powered by magic links.\n\nWe'll need you to go through a small onboarding flow to get a bit of information about you and your organization, so to get started, run `/setup-portal` in your chat to activate @Portcullis Connect#8908")
      .setColor(0x0099FF);

    const arcadeEmbed = new EmbedBuilder()
      .setDescription('<div style="position: relative; padding-bottom: calc(51.36054421768708% + 41px); height: 0; width: 100%;"><iframe src="https://demo.arcade.software/SGvAXGMzUJ4JKvzpDZJl?embed&embed_mobile=tab&embed_desktop=inline&show_copy_link=true" title="(37) Discord | #onboarding | Portcullis" frameborder="0" loading="lazy"></iframe></div>')
      .setColor(0x0099FF);

    await member.send({ embeds: [welcomeEmbed, arcadeEmbed] });
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
});

client.login(process.env.DISCORD_TOKEN);