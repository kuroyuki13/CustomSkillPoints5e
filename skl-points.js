import { libWrapper } from "./lib/libWrapper/shim.js";

const EMPTY_VALUE = "-";
const MODULE_NAME = "skill-points-5e";
const SKILL_BONUS_KEY = "skill-bonus";
const SKILL_NPROFS = 'proficiency_number';
const SKILL_POINTS = 'skill_points_amount';
const SKILL_POINTS_SPENT = 'skill_points_spent'
Hooks.once("setup", () => {
    patchActor5ePrepareData();
    patchActor5eRollSkill();
});

Hooks.on("renderActorSheet", injectActorSheet);

function patchActor5ePrepareData() {
    libWrapper.register(MODULE_NAME, "CONFIG.Actor.documentClass.prototype.prepareData", function patchedPrepareData(wrapped, ...args) {
        wrapped(...args);
        
        const skills = this.data.data.skills;
        let nprof = 0;
        for (let key in skills) {
            let skill = skills[key];
            let bonus = this.getFlag(MODULE_NAME, `${key}.${SKILL_BONUS_KEY}`) || 0;
            let bonusAsInt = parseInt(Number(bonus));


            if (!isNaN(bonusAsInt)) {
                skill.total += bonusAsInt;

                // recalculate passive score, taking observant feat into account
                const observant = this.data.flags.dnd5e?.observantFeat;
                const passiveBonus = observant && CONFIG.DND5E.characterFlags.observantFeat.skills.includes(key) ? 5 : 0;
                skill.passive = 10 + skill.total + passiveBonus;
            }
            // adding another number
            if (skill.prof.hasProficiency) {
                nprof += 1;
            }

          

        }
        this.setFlag(MODULE_NAME, SKILL_NPROFS, nprof);
        CalculateSkillPoints(this);
        let spendPoints = GetSpendPoints(this);
        this.setFlag(MODULE_NAME, SKILL_POINTS_SPENT, spendPoints);

    }, "WRAPPER");
}

//calculate how many skill points actor should have depending in number of skill proficiencies.
function CalculateSkillPoints(actor) {
    let level = actor.data.data.details.level;
    let nprof = actor.getFlag(MODULE_NAME, SKILL_NPROFS);
    //this.getFlag(MODULE_NAME, `${skillId}.${SKILL_BONUS_KEY}`);
    let sp = Math.round(((nprof / 4) * (level - 1)) + (2 * nprof));
    actor.setFlag(MODULE_NAME, SKILL_POINTS, sp);
}

function GetSpendPoints(actor) {
    const skills = actor.data.data.skills;
    let spentPoints = 0;
    for (let key in skills) {
        //let skill = skills[key];
        let bonus = actor.getFlag(MODULE_NAME, `${key}.${SKILL_BONUS_KEY}`) || 0;
        let bonusAsInt = parseInt(Number(bonus));

        if (!isNaN(bonusAsInt)) {
            spentPoints += bonusAsInt;
        }
    }
    return spentPoints;
}


function patchActor5eRollSkill() {
    libWrapper.register(MODULE_NAME, "CONFIG.Actor.documentClass.prototype.rollSkill", function patchedRollSkill(wrapped, ...args) {
        console.log("rolling patch");
        console.log(args);
        const [ skillId, options ] = args;
        const skillBonus = this.getFlag(MODULE_NAME, `${skillId}.${SKILL_BONUS_KEY}`);
        //const skillProf = this.getFlag(MODULE_NAME, `${skillId}.${SKILL_NPROFS}`);
        let bonus = 0;
        let negateProf = 0;
        if (skillBonus) {
            bonus = skillBonus;

        }
        //console.log("this", this.data.data.skills[skillId]);
        let activeSkill = this.data.data.skills[skillId];
        if (activeSkill.prof.hasProficiency) {
            console.log(activeSkill);

            negateProf = activeSkill.prof._baseProficiency * -1;
        }

        const extraOptions = {
            parts: ["@extra", "@negmod"],
            data: {
                extra: skillBonus,
                negmod: negateProf,
            },
        };
        mergeObject(options, extraOptions);
        mergeObject(options, extraOptions);

        //let skill = this.data.data.skills[skillId];
        //if (skill.proficiency.hasProficiency) {
        //    skill.proficiency.hasProficiency = false;
        //}


        return wrapped(...args);
    });
}


function injectActorSheet(app, html, data) {
    html.find(".skills-list").addClass("skill-customize");
    console.log(html);
    const skillsection = html.find(".skills-list");//.append("<li class='section-titles'>Skills</li>");
    const actor = app.actor;

    let skillpointsMenu = $("<li>");
    skillpointsMenu.addClass("skill-points-menu flexcol");
    skillsection.prepend(skillpointsMenu);
    const skillpointsSelector = html.find(".skill-points-menu");

    let headerTitle = $("<div class='custom-skill-points-title'> Custom Skill Points </div>");
    let profInput = $("<div class='proficiency-input flexrow'> <div>Proficiencies: </div><input type = 'text' size=2 class = 'profInput' id='profInput'> </div>");
    let pointData = $(
        "<div class='skillpoint-data flexrow'> " +
            "<div> available: </div>" +
            "<input type = 'text' size=2 class = 'skillpoint-data' readonly> " +
            "<div> spent: </div>" +
            "<input type = 'text' size=2 class = 'skillpoint-data' readonly> " +
        "</div>");


    skillpointsSelector.append(headerTitle);
    skillpointsSelector.append(profInput);
    skillpointsSelector.append(pointData);


    //let newSection = skillsection.prepend("<li class = 'skill points'> SkillPoints</li>");
    //let newSection = html.find(".skill points");

    //newSection.find("SkillPoints").after("<button type='button' class='test-button'><i class='fas fa-tasks'></i></button>");

    /**/
    const skillRowSelector = ".skills-list .skill";

    html.find(skillRowSelector).each(function () {
        const skillElem = $(this);
        const skillKey = $(this).attr("data-skill");
        const bonusKey = `${skillKey}.${SKILL_BONUS_KEY}`;
        const selectedAbility = actor.data.data.skills[skillKey].ability;
        /**/
        let selectElement = $("<select>");
        selectElement.addClass("skill-ability-select");
        Object.keys(actor.data.data.abilities).forEach((ability) => {
            let abilityOption = $("<option>");
            let abilityKey = ability.charAt(0).toUpperCase() + ability.slice(1);
            let abilityString = game.i18n.localize(`DND5E.Ability${abilityKey}`).slice(0, 3);

            abilityOption.attr("value", ability);

            if (ability === selectedAbility) {
                abilityOption.attr("selected", "true");
            }

            abilityOption.text(abilityString);
            selectElement.append(abilityOption);
        });
        /**/
        selectElement.change(function (event) {
            let newData = { data: { skills: {} } };
            newData.data.skills[skillKey] = { ability: event.target.value };
            actor.update(newData);
        });
        /**/
        /**/
        //create text box for bonus
        let textBoxElement = $('<input type="text" size=2>');
        textBoxElement.addClass("skill-points-bonus");
        textBoxElement.val(actor.getFlag(MODULE_NAME, bonusKey) || EMPTY_VALUE);
        /**/
        /**/
        //select text in box on click
        textBoxElement.click(function () {
            $(this).select();
        });
        /**/
        /**/
        //forward changes in textbox to character sheet
        textBoxElement.change(async function (event) {
            const bonusValue = event.target.value;
            if (bonusValue === "-" || bonusValue === "0") {
                await actor.unsetFlag(MODULE_NAME, bonusKey);
                textBoxElement.val(EMPTY_VALUE);
            } else {
                try {
                    const rollResult = await new Roll(`1d20 + ${bonusValue}`).roll();
                    const valid = !isNaN(rollResult._total);

                    if (valid) {
                        await actor.setFlag(MODULE_NAME, bonusKey, bonusValue);
                    } else {
                        textBoxElement.val(actor.getFlag(MODULE_NAME, bonusKey) || EMPTY_VALUE);
                    }
                } catch (err) {
                    textBoxElement.val(actor.getFlag(MODULE_NAME, bonusKey) || EMPTY_VALUE);
                }
            }
        });

        /**/
        /**/
        skillElem.find(".skill-ability").after(selectElement);
        skillElem.find(".skill-ability").detach();
        selectElement.after(textBoxElement);
        /**/
    });
}
