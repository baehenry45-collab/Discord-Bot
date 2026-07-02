require("dotenv").config();

const {
    REST,
    Routes,
    SlashCommandBuilder
} = require("discord.js");

const commands = [

    new SlashCommandBuilder()

        .setName("강도")
        .setDescription("AI 답변 강도 설정")

        .addStringOption(option=>

            option

                .setName("모드")

                .setDescription("강도")

                .setRequired(true)

                .addChoices(

                    {name:"순한맛",value:"순한맛"},
                    {name:"일반맛",value:"일반맛"},
                    {name:"매운맛",value:"매운맛"},
                    {name:"핵매운맛",value:"핵매운맛"}

                )

        ),

    new SlashCommandBuilder()

        .setName("말투")

        .setDescription("AI 말투 설정")

        .addStringOption(option=>

            option

                .setName("모드")

                .setDescription("말투")

                .setRequired(true)

                .addChoices(

                    {name:"AI",value:"AI"},
                    {name:"귀여움",value:"귀여움"},
                    {name:"존댓말",value:"존댓말"},
                    {name:"시크",value:"시크"},
                    {name:"떡볶이",value:"떡볶이"}

                )

        ),

    new SlashCommandBuilder()

        .setName("설정")

        .setDescription("현재 설정 확인"),

    new SlashCommandBuilder()

        .setName("초기화")

        .setDescription("설정 초기화"),

    new SlashCommandBuilder()

        .setName("상태")

        .setDescription("AI 상태 확인")

].map(command=>command.toJSON());

const rest = new REST({
    version:"10"
}).setToken(process.env.DISCORD_TOKEN);

(async()=>{

    try{

        console.log("등록중...");

        await rest.put(

            Routes.applicationCommands(

                process.env.CLIENT_ID

            ),

            {

                body:commands

            }

        );

        console.log("등록 완료");

    }catch(err){

        console.error(err);

    }

})();