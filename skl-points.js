import { libWrapper } from "./lib/libWrapper/shim.js";

const EMPTY_VALUE = "-";
const MODULE_NAME = "CustomSkillPoints5e";
const SKILL_POINTS_ASSIGNED = "skill-points-assigned";
const SKILL_NPROFS = 'proficiency_number';
const SKILL_POINTS = 'skill_points_amount';
const SKILL_POINTS_SPENT = 'skill_points_spent';


Hooks.once('init', () => {
    RegisterSettings();
});

Hooks.once("setup", () => {
    patchActor5ePrepareData();
    patchActor5eRollSkill();
});

Hooks.on("renderActorSheet", injectActorSheet);

function RegisterSettings(){
    game.settings.register(MODULE_NAME, "downshiftAmount",{
        name: "downshift formula",
        hint: "how to calculate the available skill points. downshift two levels will on average be closest in total skill points to the original proficiency system."+ 
        "downshift none gives more skillpoints, downshift three gives less.",
        scope: "world",
        type: Number,
        choices: {
            0 : "downshift none",
            1 : "downshift one level",
            2 : "downshift two levels",
            3 : "downshift three levels"
        },
        default: 2,
        config: true
    });

    game.settings.register(MODULE_NAME, "maxSkillBonus",{
        name: "Maximum Skillpoints assigned",
        hint: "the maximum number of skillpoints that can be assigned to a single skill. Based of a multiplier against proficiency. " +
        "A value of 1 clamps it to proficiency bonus, a value of 2 clamps it to two times proficiency bonus etc. with -1 being non-clamped",
        scope: "world",
        type: Number,
        default: 1,
        config: true
    });

    game.settings.register(MODULE_NAME, "useCustomSkillPoints",{
        name: "useCustomSkillPoints",
        hint: "client side decision wether to use the custom skill points. If disabled, will not draw the sections on the character sheet and do the rolls",
        scope: "client",
        type: Boolean,
        default: true,
        config: true,
        onChange: (_) => window.location.reload()
    });
}

function CalculateSkillPoints(actor) {
    const level = actor.data.data.details.level;
    const proficiencyCount = actor.getFlag(MODULE_NAME, SKILL_NPROFS);
    const downshift = game.settings.get(MODULE_NAME, "downshiftAmount");
    return Math.round( ((proficiencyCount / 4) * (level -downshift)) + (2 * proficiencyCount));
}

function GetSpendPoints(actor) {
    const skills = actor.data.data.skills;
    let spentPoints = 0;
    for (let key in skills) {
        let bonus = actor.getFlag(MODULE_NAME, `${key}.${SKILL_POINTS_ASSIGNED}`) || 0;
        spentPoints += bonus;
    }
    return spentPoints;
}

function patchedPrepareData(wrapped, ...args) {
    wrapped(...args);
    
    if (!game.settings.get(MODULE_NAME, "useCustomSkillPoints")){
    return;  
    } 

    const skills = this.data.data.skills;

    for (let key in skills) {
        const skill = skills[key];
        const bonus = this.getFlag(MODULE_NAME, `${key}.${SKILL_POINTS_ASSIGNED}`) || 0;

        skill.total += bonus;
        // recalculate passive score, taking observant feat into account
        const observant = this.data.flags.dnd5e?.observantFeat;
        const passiveBonus = observant && CONFIG.DND5E.characterFlags.observantFeat.skills.includes(key) ? 5 : 0;
        skill.passive = 10 + skill.total + passiveBonus;
    };
};

function patchActor5ePrepareData() {
    libWrapper.register(MODULE_NAME, "CONFIG.Actor.documentClass.prototype.prepareData", patchedPrepareData, "WRAPPER");
}

function patchedRollSkill(wrapped, ...args) {
    if (!game.settings.get(MODULE_NAME, "useCustomSkillPoints")){
        return;  
    } 

    const [ skillId, options ] = args;
    const skillBonus = this.getFlag(MODULE_NAME, `${skillId}.${SKILL_POINTS_ASSIGNED}`);
    let bonus = 0;
    let negateProf = 0;
    if (skillBonus) {
        bonus = skillBonus;

    }
    const activeSkill = this.data.data.skills[skillId];
    if (activeSkill.prof.hasProficiency) {
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

    return wrapped(...args);
};

function patchActor5eRollSkill() {
    libWrapper.register(MODULE_NAME, "CONFIG.Actor.documentClass.prototype.rollSkill", patchedRollSkill);
}

function injectActorSheet(app, html, _data) {
    const actor = app.actor;

    if (!game.settings.get(MODULE_NAME, "useCustomSkillPoints")){
        return;  
    } 

    html.find(".skills-list").addClass("skill-customize");

    CreateSkillPointsBox(actor, html);
    CreateSkillPointAssignment(actor, html);

}

function GetPreviousAssignedAsInt(actor, key) {
    let previousAssigned = parseInt(actor.getFlag(MODULE_NAME, key));
    if (isNaN(previousAssigned)) {
        return 0;
    }
    else {
        return previousAssigned;

    }
}

function CreateSkillPointsBox(actor, html) {
    //setting up outer box and parent html section
    const skillsection = html.find(".skills-list");//.append("<li class='section-titles'>Skills</li>");
    let skillpointsMenu = $("<li>");
    skillpointsMenu.addClass("skill-points-menu flexcol");
    skillsection.prepend(skillpointsMenu);
    //find newly created header to append children to.
    const skillpointsSelector = html.find(".skill-points-menu");

    ////previous second line html section with embedded children.
    ///! Get getElementbyId failed. both with the previous profInput variable, as with the html data from function. 
    //let profInput = $(
    //  "<div class='proficiency-input flexrow'>"+
    //        "<div>Proficiencies: </div>"+
    //        "<input type = 'text' size=2 class = 'profInput' id='profInput'>"+ 
    //  "</div>"
    //);

    ////previous third line html section with embedded children
    //let pointData = $(
    //    "<div class='skillpoint-data flexrow'> " +
    //        "<div> available: </div>" +
    //        "<input type = 'text' size=2 class = 'skillpoint-data' readonly> " +
    //        "<div> spent: </div>" +
    //        "<input type = 'text' size=2 class = 'skillpoint-data' readonly> " +
    //    "</div>"
    //);

    //create all html sections for skill points
    //first line: section title
    let headerTitle = $("<div class='custom-skill-points-title csp-title'>Custom Skill Points</div>");
    //second line parent
    let profInputOuter = $("<div class='proficiency-input flexrow csp-wrapper'></div>");
    //second line children
    let profInputText = $("<div class='csp-label'>Proficiencies:</div>");
    let profInputBox = $("<input type='number' class='profInput csp-input' id='profInput'>");
    //third line parent
    let skillPointsDataOuter = $("<div class='skillpoint-data flexrow csp-wrapper'></div>");
    //third line children
    let skillPointsAvailableText = $("<div class='csp-label'>Total available:</div>");
    let skillPointsAvailableInfo = $("<input type='text' class='skillpoint-data csp-display' disabled>");
    let skillPointsSpentText = $("<div class='csp-label'>Spent:</div>");
    let skillPointsSpentInfo = $("<input type='text' class='skillpoint-data csp-display' disabled>");

    //append section title
    skillpointsSelector.append(headerTitle);
    //append 2nd line outer then find it in hmtl to be available for appending children
    skillpointsSelector.append(profInputOuter);
    const profInputSelector = html.find(".proficiency-input");
    //append 3rd line outer then find it in html to be available for appending children
    skillpointsSelector.append(skillPointsDataOuter);
    const skillPointDataSelector = html.find(".skillpoint-data");

    //append profinput text
    profInputSelector.append(profInputText);

    //setup info in textbox
    profInputBox.val(actor.getFlag(MODULE_NAME, SKILL_NPROFS) || EMPTY_VALUE);
    profInputBox.click(function () {
        $(this).select();
    });
    //handling input to textbox
    profInputBox.change(async function (event) {
        const numberOfProf = event.target.value;
        if (numberOfProf === "-" || numberOfProf === "0") {
            await actor.unsetFlag(MODULE_NAME, SKILL_NPROFS);
            profInputBox.val(EMPTY_VALUE);
        }
        else {         
            await actor.setFlag(MODULE_NAME, SKILL_NPROFS, numberOfProf);
            let sp = CalculateSkillPoints(actor);
            await actor.setFlag(MODULE_NAME, SKILL_POINTS, sp);
        }
    });
    //append the box to the 2nd line
    profInputSelector.append(profInputBox);

    //set text value for available skills points and append
    skillPointDataSelector.append(skillPointsAvailableText);
    const availablePoints = actor.getFlag(MODULE_NAME, SKILL_POINTS)
    skillPointsAvailableInfo.val(availablePoints || EMPTY_VALUE);
    skillPointDataSelector.append(skillPointsAvailableInfo);

    //set text and value for spent skill points and append
    skillPointDataSelector.append(skillPointsSpentText);
    const spentPoints = actor.getFlag(MODULE_NAME, SKILL_POINTS_SPENT);
    skillPointsSpentInfo.val(spentPoints || EMPTY_VALUE);
    skillPointDataSelector.append(skillPointsSpentInfo);
}

function CreateSkillPointAssignment(actor, html) {
    const skillRowSelector = ".skills-list .skill";

    html.find(skillRowSelector).each(function () {
        const skillElem = $(this);
        const skillKey = $(this).attr("data-skill");
        const assignedPointsKey = `${skillKey}.${SKILL_POINTS_ASSIGNED}`;
        const selectedAbility = actor.data.data.skills[skillKey].ability;

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

        selectElement.change(function (event) {
            let newData = { data: { skills: {} } };
            newData.data.skills[skillKey] = { ability: event.target.value };
            actor.update(newData);
        });

        //create text box for bonus
        let textBoxElement = $('<input type="text" size=2>');
        textBoxElement.addClass("skill-points-assigned");
        textBoxElement.val(actor.getFlag(MODULE_NAME, assignedPointsKey) || EMPTY_VALUE);

        //select text in box on click
        textBoxElement.click(function () {
            $(this).select();
        });

        textBoxElement.change(async function (event) {
            const newAssignedPoints = event.target.value;
            if (newAssignedPoints === "-" || newAssignedPoints === "0") {
                textBoxElement.val(EMPTY_VALUE);
                let diff = 0 - GetPreviousAssignedAsInt(actor, assignedPointsKey);
                let newTotal = GetSpendPoints(actor) + diff;
                await actor.setFlag(MODULE_NAME, SKILL_POINTS_SPENT, newTotal);
                await actor.unsetFlag(MODULE_NAME, assignedPointsKey);
            }
            else {
                try {
                    //assigned points shouldn't go above proficiency bonus
                    let bonusMultiplier = game.settings.get(MODULE_NAME, "maxSkillBonus");
                    
                    let moreThanMaxBonus = (bonusMultiplier == -1) ? false :  newAssignedPoints > actor.data.data.prof._baseProficiency*bonusMultiplier;

                    let diff = (parseInt(newAssignedPoints) - GetPreviousAssignedAsInt(actor, assignedPointsKey));
                    let newTotal = GetSpendPoints(actor) + diff;
                    let tooMuch = newTotal > parseInt(actor.getFlag(MODULE_NAME, SKILL_POINTS));
                    
                    const rollResult = await new Roll(`1d20 + ${newAssignedPoints}`).roll();
                    const valid = !isNaN(rollResult._total);

                    if (valid && !tooMuch && !moreThanMaxBonus) {
                        await actor.setFlag(MODULE_NAME, assignedPointsKey, newAssignedPoints);
                        await actor.setFlag(MODULE_NAME, SKILL_POINTS_SPENT, newTotal);
                    }
                    else {
                        textBoxElement.val(actor.getFlag(MODULE_NAME, assignedPointsKey) || EMPTY_VALUE);
                    }
                }
                catch (err) {
                    textBoxElement.val(actor.getFlag(MODULE_NAME, assignedPointsKey) || EMPTY_VALUE);
                }
            }
        });

        skillElem.find(".skill-ability").after(selectElement);
        skillElem.find(".skill-ability").detach();
        selectElement.after(textBoxElement);

    });
}