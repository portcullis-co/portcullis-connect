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
import { z } from 'zod';
import { createSvixApp } from './utils/svix';

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

// Define the schema outside the event handler
const registrationSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  organization: z.string().min(1, "Organization name is required"),
  domain: z.string().min(1, "Domain is required"),
  useCase: z.string()
    .transform((val) => parseInt(val, 10))
    .pipe(z.number().positive().int()
    .min(1, "Table size must be at least 1 row")
    .max(1000000000, "Table size cannot exceed 1 billion rows"))
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

        const largestTableInput = new TextInputBuilder()
          .setCustomId('largestTable')
          .setLabel('Largest Table Size (rows)')
          .setPlaceholder('e.g. 1000000')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(firstNameInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(lastNameInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(organizationInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(domainInput),
          new ActionRowBuilder<TextInputBuilder>().addComponents(largestTableInput)
        );

        await interaction.showModal(modal);
      } catch (error) {
        console.error('Error showing modal:', error);
        await interaction.reply({ content: 'Error showing registration form', ephemeral: true });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'client-registration-form') {
      await interaction.deferReply({ ephemeral: true });
      
      try {
        // Ensure all fields are defined before parsing
        const firstName = interaction.fields.getTextInputValue('firstName');
        const lastName = interaction.fields.getTextInputValue('lastName');
        const organization = interaction.fields.getTextInputValue('organization');
        const domain = interaction.fields.getTextInputValue('domain');
        const largestTable = interaction.fields.getTextInputValue('largestTable');

        // Check for undefined values
        if (!firstName || !lastName || !organization || !domain || !largestTable) {
          await interaction.editReply({
            content: 'All fields are required. Please fill in all fields.'
          });
          return;
        }

        // Parse and validate the input
        const formData = registrationSchema.parse({
          firstName,
          lastName,
          organization,
          domain,
          largestTable
        });

        // Now formData.largestTable is guaranteed to be a valid number
        // Continue with the rest of your code using formData instead of direct field access
        let role = interaction.guild?.roles.cache.find(r => r.name === formData.domain);
        if (!role) {
          const color = '#030303';
          const logo = `https://img.logo.dev/${formData.domain}?token=pk_Bm3yO9a1RZumHNuIQJtxqg`;
          role = await interaction.guild?.roles.create({
            name: formData.domain,
            color: color,
            icon: logo,
            reason: 'New client domain role'
          });
        }

        // Create private channel
        const channelName = `${formData.organization.toLowerCase().replace(/[^a-z0-9]/g, '-')}-welcome`;
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
            title: `Welcome ${formData.firstName} ${formData.lastName}!`,
            description: `Thank you for registering with Portcullis.\n\n**Organization:** ${formData.organization}\n**Domain:** ${formData.domain}\n**Largest Table Size:** ${formData.useCase.toLocaleString()} rows`,
            color: role?.color
          }]
        });

        // Confirm to user
        await interaction.editReply({
          content: `Registration complete! Please check ${channel}`,
          components: []
        });

      } catch (error) {
        if (error instanceof z.ZodError) {
          const errorMessage = error.errors.map(err => err.message).join('\n');
          await interaction.editReply({
            content: `Invalid input:\n${errorMessage}`
          });
          return;
        }
        // Handle other errors...
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
        const organization = interaction.options.get('organization')?.value as string;
    
        try {
          const result = await createClerkUser(
            email,
            interaction.user.id,
            firstName,
            lastName,
            domain,
            organization
          );
          const svixAppId = await createSvixApp(organization);
    
          // Prepare the data to insert into Supabase
          const userData = {
            id: interaction.user.id, // Add the id here
            email,
            discord_user_id: interaction.user.id, // Get Discord user ID from the interaction
            first_name: firstName,  // Make sure property names match Supabase schema
            last_name: lastName,
            domain,
            organization,
            svixAppId,  // Include Svix App ID
          };
    
          // Insert or update the user in Supabase (but no need to use the response)
          await upsertUserToSupabase(userData);
    
          await interaction.editReply({
            content: `✅ User created successfully!
    Email: ${email}
    Name: ${firstName} ${lastName}
    Clerk ID: ${result.user.id}
    ${result.organization && typeof result.organization !== 'string' ? `Organization ID: ${result.organization.id}` : ''}
    ${result.organization && typeof result.organization !== 'string' ? `API Key: ${result.organization.publicMetadata?.apiKey}` : ''}`
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
        const exports = interaction.options.get('exports')?.value as number;
        const currency = interaction.options.get('currency')?.value as string;
        
        const amount = exports * 250;

        const quote = await createHyperlineQuote({
          customer_id: customerId,
          amount: amount,
          currency: currency
        });

        // Ensure all values are defined before creating the embed
        const embed = new EmbedBuilder()
          .setTitle('Quote Created')
          .setDescription(`A new quote has been created for customer ${customerId}`)
          .addFields(
            { name: 'Exports per Month', value: `${exports ?? '10'}`, inline: true },
            { name: 'Amount', value: `${amount.toFixed(2)} ${currency?.toUpperCase() ?? 'N/A'}`, inline: true },
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