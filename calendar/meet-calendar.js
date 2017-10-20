const BASE_DOMAIN = "meet.jit.si";
const BASE_URL = "https://" + BASE_DOMAIN + "/";
const APP_NAME = "Jitsi";
const NUMBER_RETRIEVE_SCRIPT = false;
const CONFERENCE_MAPPER_SCRIPT = false;

//A text to be used when adding info to the location field.
const LOCATION_TEXT = APP_NAME + ' Meeting';

let generateRoomNameAsDigits = false;

/**
 * The event page we will be updating.
 */
class EventContainer {
    constructor() {
        // Numbers used to access the service, will be listed in the
        // autogenerated description of the event when adding a meeting to it.
        // {"US": ["+1xxx", "+1xxx"], "France": ["+33xxx"]}
        this.numbers = {};

        // used to implement autocreate meetings, this is done after all
        // the needed information is retrieved as numbers, upon calling update
        this.scheduleAutoCreateMeeting = false;
    }

    /**
     * @returns {EventContainer}
     */
    static getInstance() {
        var eventEditPage = document.querySelector('#maincell #coverinner');
        if (eventEditPage)
            return new GEvent(eventEditPage);
        else if (document.querySelector('body').dataset.viewfamily)
            return new G2Event(document.querySelector('body'));
        else
            return new MSLiveEvent();
    }

    /**
     * The description of the event.
     * @abstract
     * @returns {Description}
     */
    get description() {}

    /**
     * The button container where we will add the jitsi button.
     * @abstract
     */
    get buttonContainer() {}

    /**
     * The location of the event.
     * @abstract
     * @returns {Location}
     */
    get location() {}

    /**
     * The container element of the event edit page.
     * @returns {*}
     */
    get container(){
        return this.containerElement;
    };

    set container(c){
        this.containerElement = c;
    };

    /**
     * Main entry point of the event modifictaions.
     * @abstract
     */
    update() {}

    /**
     * Checks for the button on current page
     */
    isButtonPresent() {
        return ($('#jitsi_button').length >= 1);
    }

    /**
     * Clears instances.
     */
    reset() {
        this.descriptionInstance = null;
        this.locationInstance = null;
    }

    /**
     * Updates meetingId, if there is meetingId set it, if not generate it.
     */
    updateMeetingId() {

        if (!this.isButtonPresent()) {
            // there is no button present we will add it, so we will clean
            // the state of the EventContainer, so we can update all values.
            // this clears the states between creating/editing different events
            // we add the button
            this.reset();
        }

        var inviteText;
        if (this.location && this.location.text)
            inviteText = this.location.text;
        else
            inviteText = this.description.value;

        var ix = -1;
        if (inviteText) {
            ix = inviteText.indexOf(BASE_URL);
        }
        var url;
        if (ix != -1 && (url = inviteText.substring(ix)) && url.length > 0) {
            let resMeetingId = url.substring(BASE_URL.length);

            // there can be ',' after the meeting, normally added when adding
            // physical rooms to the meeting
            var regexp = /([a-zA-Z]+).*/g;
            var match = regexp.exec(resMeetingId);
            if (match && match.length > 1)
                resMeetingId = match[1];

            this.meetingId = resMeetingId;
        }
        else {

            if (generateRoomNameAsDigits) {
                this.meetingId = randomDigitString(10);
            }
            else
                this.meetingId = generateRoomWithoutSeparator();

            if(NUMBER_RETRIEVE_SCRIPT) {
                // queries a predefined location for settings
                $.getJSON(NUMBER_RETRIEVE_SCRIPT,
                    jsonobj => {
                        this.inviteTextTemplate = jsonobj.inviteTextTemplate;

                        // if there is a room name dictionary lets use it and
                        // generate new room name
                        if (jsonobj.roomNameDictionary) {
                            this.meetingId = generateRoomWithoutSeparator(
                                    jsonobj.roomNameDictionary);
                        }

                        if(!jsonobj.numbersEnabled)
                            return;

                        this.numbers = jsonobj.numbers;
                        this.inviteNumbersTextTemplate
                            = jsonobj.inviteNumbersTextTemplate;

                        if (this.scheduleAutoCreateMeeting) {
                            this.description.clickAddMeeting(
                                false, this.location);
                            this.scheduleAutoCreateMeeting = false;
                        }
                    });
            } else {
                if (this.scheduleAutoCreateMeeting) {
                    this.description.clickAddMeeting(
                        false, this.location);
                    this.scheduleAutoCreateMeeting = false;
                }
            }
        }
    }

    /**
     * Adds the jitsi button in buttonContainer.
     */
    addJitsiButton() {
        var container = this.buttonContainer;
        if (!container)
            return;

        var description = this.description;

        container.addClass('button_container');
        container.append(
            '<div id="jitsi_button" ' +
                'class="goog-inline-block jfk-button jfk-button-action ' +
                    'jfk-button-clear-outline">' +
                '<a href="#" style="color: white"></a>' +
            '</div>');
        description.update(this.location);
    }
}

/**
 * Represents the location field.
 */
class Location {
    /**
     * The text in the location field.
     * @abstract
     */
    get text() {}

    /**
     * Adds location info.
     * @abstract
     * @param text
     */
    addLocationText(text){}
}

/**
 * Represents the description of the event.
 */
class Description {
    constructor(event) {
        this.event = event;
    }
    /**
     * Updates the description and location field is not already updated.
     * @param location
     */
    update(location) {
        var isDescriptionUpdated = false;

        // checks whether description was updated.
        if (this.element != undefined) {
            var descriptionContainsURL =
                (this.value
                    && this.value.length >= 1
                    && this.value.indexOf(BASE_URL) !== -1);
            isDescriptionUpdated =
                descriptionContainsURL
                // checks whether there is the generated name in the location
                // input if there is a location
                || (location != null
                    && location.text.indexOf(LOCATION_TEXT) != -1);
        }

        if(isDescriptionUpdated) {
            // update button url of event has all the data
            this.updateButtonURL();
        } else {
            // update button as event description has no meeting set
            this.updateInitialButtonURL(location);
        }
    }

    /**
     * Creates meeting, filling all needed fields.
     * @param isDescriptionUpdated - whether description was already updated,
     * true when we are editing event.
     * @param the location to use to fill the meeting URL
     */
    clickAddMeeting(isDescriptionUpdated, location) {
        if (!isDescriptionUpdated) {
            // Build the invitation content
            if (CONFERENCE_MAPPER_SCRIPT) {
                // queries a predefined location for settings
                $.getJSON(CONFERENCE_MAPPER_SCRIPT
                    + "?conference=" + this.event.meetingId + "@conference." + BASE_DOMAIN,
                    jsonobj => {
                        if (jsonobj.conference && jsonobj.id) {
                            this.addDescriptionText(
                                this.getInviteText(jsonobj.id));
                        }
                        else {
                            this.addDescriptionText(
                                this.getInviteText());
                        }
                    });
            }
            else {
                this.addDescriptionText(this.getInviteText());
            }
            this.updateButtonURL();

            if (location)
                location.addLocationText(
                    LOCATION_TEXT + ' - ' + BASE_URL + this.event.meetingId);
        } else {
            this.updateButtonURL();
        }
    }

    /**
     * The description html element.
     * @abstract
     */
    get element() {}

    /**
     * The text value of the description of the event.
     * @abstract
     */
    get value() {}

    /**
     * Adds description text to the existing text.
     * @abstract
     * @param text
     */
    addDescriptionText(text){}

    /**
     * Generates description text used for the invite.
     * @param dialInID optional dial in id
     * @returns {String}
     */
    getInviteText(dialInID) {
        let inviteText;
        let hasTemplate = false;

        if (this.event.inviteTextTemplate) {
            inviteText = this.event.inviteTextTemplate;
            hasTemplate = true;
        } else {
            inviteText =
                "Click the following link to join the meeting " +
                "from your computer: " + BASE_URL + this.event.meetingId;
        }

        if (this.event.numbers && Object.keys(this.event.numbers).length > 0) {
            if (this.event.inviteNumbersTextTemplate) {
                inviteText += this.event.inviteNumbersTextTemplate;
                hasTemplate = true;
                Object.keys(this.event.numbers).forEach(key => {
                    let value = this.event.numbers[key];
                    inviteText = inviteText.replace(
                        '{' + key + '}',
                        key + ": " + value);
                });
            } else {
                inviteText += "\n\n=====";
                inviteText +="\n\nJust want to dial in on your phone? ";
                inviteText += " \n\nCall one of the following numbers: ";
                Object.keys(this.event.numbers).forEach(key => {
                    let value = this.event.numbers[key];
                    inviteText += "\n" + key + ": " + value;
                });
                inviteText += "\n\nSay your conference name: '"
                    + this.event.meetingId
                    + "' and you will be connected!";
            }
        }

        if (hasTemplate) {
            inviteText = inviteText.replace(/\{BASE_URL\}/g, BASE_URL);
            inviteText
                = inviteText.replace(/\{MEETING_ID\}/g, this.event.meetingId);
            if (dialInID) {
                inviteText
                    = inviteText.replace(/\{DIALIN_ID\}/g, dialInID);
            }
        }

        return inviteText;
    }

    /**
     * Updates the initial button text and click handler when there is
     * no meeting scheduled.
     */
    updateInitialButtonURL(location) {
        var button = $('#jitsi_button a');
        button.html('Add a ' + LOCATION_TEXT);
        button.attr('href', '#');
        button.on('click', e => {
            e.preventDefault();
            this.clickAddMeeting(false, location);
        });
    }

    /**
     * Updates the url for the button.
     */
    updateButtonURL() {
        try {
            var button = $('#jitsi_button a');
            button.html("Join your " + LOCATION_TEXT + " now");
            button.off('click');
            button.attr('href', BASE_URL + this.event.meetingId);
            button.attr('target', '_new');
        } catch (e) {
            console.log(e);
        }
    }
}

/**
 * The google calendar specific implementation of the event page.
 */
class GEvent extends EventContainer {
    constructor(eventEditPage) {
        super();

        this.container = eventEditPage;
    }

    /**
     * Updates content (adds the button if is not there).
     * This is the entry point for all page modifications.
     */
    update() {
        if ($('table.ep-dp-dt').is(":visible")) {
            this.updateMeetingId();

            if(!this.isButtonPresent())
                this.addJitsiButton();
        }
    }

    /**
     * The event location.
     * @returns {GLocation}
     */
    get location() {
        if (!this.locationInstance)
            this.locationInstance = new GLocation();
        return this.locationInstance;
    }

    /**
     * The button container holding jitsi button.
     * @returns {*}
     */
    get buttonContainer() {
        // we will create a new raw to place the button
        // this row will be after the Video Call row
        let neighbor = $(getNodeID('rtc-row'));
        if(neighbor.length == 0)
            return null;

        let newRowID = getNodePrefix() + '.' + 'jitsi-rtc-row';
        let newRow = $('<tr id="' + newRowID + '">' +
                        '<th class="ep-dp-dt-th"></th>' +
                        '<td class="ep-dp-dt-td"></td>' +
                       '</tr>');
        newRow.insertAfter(neighbor);

        return newRow.find('td');
    }

    /**
     * The event description.
     * @returns {GDescription}
     */
    get description() {
        if (!this.descriptionInstance)
            this.descriptionInstance = new GDescription(this);
        return this.descriptionInstance;
    }
}

/**
 * The google calendar specific implementation of the location field in the
 * event page.
 */
class GLocation extends Location {
    constructor() {
        super();
        this.elem = $('[id*=location].ep-dp-input input');

        if (this.elem.length === 0) {
            // this is the case where location is not editable
            let element = $('[id*=location].ep-dp-input div > div')[0];
            this.elem = element;
            this.elem.val = function () {
                return element.innerHTML;
            }
        }
    }

    /**
     * The text from the location input field.
     * @returns {*}
     */
    get text() {
        return this.elem.val();
    }

    /**
     * Adds text to location input.
     * @param text
     */
    addLocationText(text){
        // Set the location if there is content
        var locationNode = this.elem[0];

        if (!locationNode) {
            // this is the case where location was not editable
            // we click it to make it visible and then replace the element
            // so we can actually edit it and add the text
            this.elem.click();
            this.elem = $('[id*=location].ep-dp-input input');
            locationNode = this.elem[0];
        }

        if (locationNode) {
            locationNode.dispatchEvent(getKeyboardEvent('keydown'));
            locationNode.value = locationNode.value == '' ?
                text : locationNode.value + ', ' + text;
            locationNode.dispatchEvent(getKeyboardEvent('input'));
            locationNode.dispatchEvent(getKeyboardEvent('keyup'));
            var changeEvt2 = document.createEvent("HTMLEvents");
            changeEvt2.initEvent('change', false, true);
            locationNode.dispatchEvent(changeEvt2);
        }
    }
}

/**
 * The google calendar specific implementation of the description textarea in
 * the event page.
 */
class GDescription extends Description {
    constructor(event) {
        super(event);

        var description = $(getNodeID('descript textarea'))[0];
        var descriptionRow = $(getNodeID('descript-row'));

        if (descriptionRow.find('textarea').length === 0) {
            // this is the case where description is not editable
            // when loading the event (no textarea)
            description = $('[id*="descript"] div > div > div')[0];
            description.value = description.innerHTML;
            description.noTextArea = true;
        }

        this.element = description;
    }

    /**
     * The html element.
     * @returns {*}
     */
    get element() {
        return this.el;
    }

    set element(el) {
        this.el = el;
    }

    /**
     * The text value of the description.
     */
    get value() {
        return this.el.value;
    }

    /**
     * Adds text to the description.
     * @param text
     */
    addDescriptionText(text){
        if (this.el.noTextArea) {
            // this is the case where description was not editable
            // so we click on the element to make it editable
            // and replace the elements do the actual edit can function
            this.el.click();

            this.element = $(getNodeID('descript textarea'))[0];
        }

        this.el.dispatchEvent(getKeyboardEvent('keydown'));

        // if there is already text in the description append on new line
        if (this.el.value)
            this.el.value = this.el.value + '\n';

        this.el.value = this.el.value + text;
        this.el.dispatchEvent(getKeyboardEvent('input'));
        this.el.dispatchEvent(getKeyboardEvent('keyup'));
        var changeEvt1 = document.createEvent("HTMLEvents");
        changeEvt1.initEvent('change', false, true);
        this.el.dispatchEvent(changeEvt1);
    }
}

/**
 * The new google calendar specific implementation of the event page.
 */
class G2Event extends EventContainer {
    constructor(eventEditPage) {
        super();

        this.container = eventEditPage;
    }

    /**
     * Updates content (adds the button if is not there).
     * This is the entry point for all page modifications.
     */
    update() {
        // we want to trigger all the logic only when we have enough elements
        // on the page, as the new interface is loading live and some elements
        // are missing when directly go the event edit page
        // we require the notifications element and location or description
        // element
        if ($('#xNtList').length != 0    // notifications
            && (
                $("#xLocIn").length != 0 // editable location
                || $('#xOnCal').length != 0     // readonly location
                || $('#xDescIn').length != 0    // editable description
                || $('#xDesc').length != 0      // readonly description
            )
            && !this.isButtonPresent()) {
            this.updateMeetingId();
            this.addJitsiButton();
        }
    }

    /**
     * The event location.
     * @returns {GLocation}
     */
    get location() {
        if (!this.locationInstance) {
            this.locationInstance = new G2Location();
        }
        return this.locationInstance;
    }

    /**
     * The button container holding jitsi button.
     * @returns {*}
     */
    get buttonContainer() {

        // we will create a new raw to place the button
        // this row will be before the notifications row
        let neighbor = $('#xNtList').parent();
        if(neighbor.length == 0){
            return null;
        }

        let buttonContainer = $('#jitsi_button_container');
        if (buttonContainer.length !== 0) {
            return buttonContainer.find('content');
        }

        let newRow = $(
            '<div class = "FrSOzf">\
                <div class = "tzcF6">\
                    <div class = "DPvwYc jitsi_edit_page_icon"/>\
                </div>\
                <div class = "j3nyw">\
                    <div class = "BY5aAd">\
                        <div role = "button" \
                            class = "O0WRkf zZhnYe e3Duub C0oVfc M9Bg4d" \
                            id="jitsi_button_container">\
                            <content class = "CwaK9">\
                                <span id="jitsi_button" \
                                      class="RveJvd snByac">\
                                </span>\
                            </content>\
                        </div>\
                    </div>\
                </div>\
            </div>');
        newRow.insertBefore(neighbor);

        return newRow.find('content');
    }

    /**
     * Adds the jitsi button in buttonContainer.
     */
    addJitsiButton() {
        var container = this.buttonContainer;
        if (!container)
            return false;

        this.description.update(this.location);
    }

    /**
     * The event description.
     * @returns {GDescription}
     */
    get description() {
        if (!this.descriptionInstance)
            this.descriptionInstance = new G2Description(this);
        return this.descriptionInstance;
    }
}

/**
 * The google calendar specific implementation of the location field in the
 * event page.
 */
class G2Location extends Location {

    _getLocationElement() {
        var elem = $("#xLocIn").find("#xLocIn");

        if (elem.length === 0) {
            // this is the case where location is not editable
            let element = $('#xOnCal')[0];

            if (!element) {
                return undefined;
            }

            elem = element;
            elem.val = function () {
                return element.innerHTML;
            }
        }

        return elem;
    }

    /**
     * The text from the location input field.
     * @returns {*}
     */
    get text() {
        var e = this._getLocationElement();

        if (e)
            return e.val();
        else
            return undefined;
    }

    /**
     * Adds text to location input.
     * @param text
     */
    addLocationText(text){
        var elem = $("#xLocIn").find("#xLocIn");

        // in case this element is missing, means we cannot edit the text
        if (elem.length === 0)
            return;

        // Set the location if there is content
        var locationNode = elem[0];
        if (locationNode) {
            locationNode.focus(); // Focus needed to make a simulation of keying in.
            elem.attr(
                'value',
                locationNode.value == '' ?
                    text : locationNode.value + ', ' + text);
            locationNode.dispatchEvent(getKeyboardEvent('input'));
            // tried many combinations and cannot make it reliably working
            // in some cases hovering over the input will make it save,
            // otherwise text is seen in the input but is not saved after
            // clicking save
            window.setTimeout(function(){
                locationNode.focus();
                elem.val(elem.val()+ " ");
                locationNode.dispatchEvent(getKeyboardEvent('input'));
            },1000);
        }
    }
}

/**
 * The google calendar specific implementation of the description textarea in
 * the event page.
 */
class G2Description extends Description {

    /**
     * The html element.
     * @returns {*}
     */
    get element() {
        var description = $('#xDescIn > [role="textbox"]');
        if (!description) {
            // maybe it is not editable
            description = $('#xDesc > div');
            description.notEditable = true;
        }

        return description;
    }

    /**
     * The text value of the description.
     */
    get value() {
        return this.element.text();
    }

    /**
     * Adds text to the description.
     * @param text
     */
    addDescriptionText(text){
        var el = this.element;
        if (el.notEditable)
            return;

        var descriptionNode = el[0];
        descriptionNode.dispatchEvent(getKeyboardEvent('keydown'));

        // format new lines
        var textToInsert = text.replace(/(?:\r\n|\r|\n)/g, '<br />');

        // // if there is already text in the description append on new line
        if (el.text().length > 0) {
            el.append('<br/><br/>');
        }
        el.append(textToInsert);

        descriptionNode.dispatchEvent(getKeyboardEvent('input'));
        descriptionNode.dispatchEvent(getKeyboardEvent('keyup'));
    }

    /**
     * Updates the initial button text and click handler when there is
     * no meeting scheduled.
     */
    updateInitialButtonURL(location) {
        var button = $('#jitsi_button');
        button.html('Add a ' + LOCATION_TEXT);

        var container = this.event.buttonContainer;

        container.parent().off('click');
        container.parent().on('click', e => {
            e.preventDefault();

            this.clickAddMeeting(false, location);
        });
    }

    /**
     * Updates the url for the button.
     */
    updateButtonURL() {
        try {
            var button = $('#jitsi_button');
            button.html("Join your " + LOCATION_TEXT + " now");

            var container = this.event.buttonContainer;

            container.parent().off('click');
            container.parent().on('click', e => {
                e.preventDefault();

                window.open(BASE_URL + this.event.meetingId, '_blank');
            });
        } catch (e) {
            console.log(e);
        }
    }
}

/**
 * The outlook live calendar specific implementation of the event page.
 */
class MSLiveEvent extends EventContainer {
    constructor() {
        super();

        this.container = document.getElementsByTagName("BODY")[0];
    }

    /**
     * Updates content (adds the button if is not there).
     * This is the entry point for all page modifications.
     */
    update() {
        if ($("div[aria-label='Event compose form']").is(":visible")) {
            this.updateMeetingId();

            if(!this.isButtonPresent())
                this.addJitsiButton();
        }
    }

    /**
     * The event location. Currently not supported.
     * @returns {MSLiveLocation}
     */
    get location() {
        return null;
    }

    /**
     * The button container holding jitsi button.
     * @returns {*}
     */
    get buttonContainer() {
        var container
            = $("span[id='MeetingCompose.LocationInputLabel']").parent();
        if(container.length == 0)
            return null;
        return container;
    }

    /**
     * The event description.
     * @returns {MSLiveDescription}
     */
    get description() {
        if (!this.descriptionInstance)
            this.descriptionInstance = new MSLiveDescription(this);
        return this.descriptionInstance;
    }
}

/**
 * The outlook live calendar specific implementation of the description textarea
 * in the event page.
 */
class MSLiveDescription extends Description {
    constructor(event) {
        super(event);

        var description = $("div[aria-label='Event body'] p:first-child");
        if (description.length == 0)
            return;

        this.element = description;
    }

    /**
     * The html element.
     * @returns {*}
     */
    get element() {
        return this.el[0];
    }

    set element(el) {
        this.el = el;
    }

    /**
     * The text value of the description.
     */
    get value() {
        return this.el.text();
    }

    /**
     * Adds text to the description.
     * @param text
     */
    addDescriptionText(text){
        // format link
        var urlRegex = /(https?:\/\/[^\s]+)/g;
        let textToInsert = text.replace(urlRegex, function(url) {
            return '<a href="' + url + '">' + url + '</a>';
        });

        // format new lines
        textToInsert = textToInsert.replace(/(?:\r\n|\r|\n)/g, '<br />');

        this.el.html(this.value + textToInsert);
    }
}

/**
 * Returns the node id.
 */
function getNodeID(name) {
    return '#\\' + getNodePrefix() + '\\.' + name;
}

/**
 * Returns the prefix to use for nodes.
 * @returns {*}
 */
function getNodePrefix() {
    var labelNode = $("[id*='location-label']");
    if (labelNode.length >= 1) {
        return labelNode[0].id.split('.')[0];
    }
    return '';
}

/**
 * Returns an event object that can be used to be simulated
 */
function getKeyboardEvent(event) {
    var keyboardEvent = document.createEvent('KeyboardEvent');
    var initMethod = typeof keyboardEvent.initKeyboardEvent !== 'undefined' ?
        'initKeyboardEvent' : 'initKeyEvent';
    keyboardEvent[initMethod](
        event // event type (keydown, keyup, or keypress)
        , true // bubbles
        , true // cancel-able
        , window // viewArg (window)
        , false // ctrlKeyArg
        , false // altKeyArg
        , false // shiftKeyArg
        , false // metaKeyArg
        , 32 // keyCodeArg
        , 0 // charCodeArg
    );

    return keyboardEvent;
}

/**
 * Finds a parameter in the page url parameters.
 * @param parameterName the name of the param to search for
 * @returns {String} the parameter value.
 */
function findGetParameter(parameterName) {
    var result = null,
        tmp = [];
    location.search
        .substr(1)
        .split("&")
        .forEach(function (item) {
            tmp = item.split("=");
            if (tmp[0] === parameterName) result = decodeURIComponent(tmp[1]);
        });
    return result;
}

/**
 * Checks whether it is ok to add the button to current page and add it.
 */
function checkAndUpdateCalendar() {
    var MutationObserver
        = window.MutationObserver || window.WebKitMutationObserver;
    var c = EventContainer.getInstance();
    if (c) {
        new MutationObserver(function(mutations) {
            try {
                mutations.every(function() {
                    c.update();
                });
            } catch(e) {
                console.log(e);
            }
        }).observe(c.container, {
            childList: true, attributes: true, characterData: false });

        // anyway try to add the button, this is the case when directly going
        // to create event page
        if(!c.isButtonPresent()) {
            // popup adds autoCreateMeeting param when open directly event
            // create page
            if (findGetParameter('autoCreateMeeting')
                && findGetParameter('extid') === chrome.runtime.id) {
                c.scheduleAutoCreateMeeting = true;
            }

            c.update();
        }

        // Listen for mutations (showing the bubble), for quick adding events
        var body = document.querySelector('body');
        new MutationObserver(function() {
            var quickAddDialog = $('.bubble');
            if (quickAddDialog.length >= 1) {
                // schedule execution, give time to all mutation observers
                // to do their job, we try to add our button in the dialog
                // when all other content had been added
                setTimeout(function () {
                    var quickAddDialogContainer
                        = $(".bubblecontent .event-create-container");
                    // skip if our button is already added
                    if(quickAddDialogContainer.length < 1
                        || $('#jitsi_button_quick_add').length != 0) {
                        return;
                    }

                    var buttonsRow
                        = $('.bubblecontent .event-create-container > .action-tile');
                    if (buttonsRow.length < 1) {
                        return;
                    }

                    var numberOfButtons
                        = buttonsRow.find('.split-tile-right').length;
                    var lastButtonGroup
                        = buttonsRow.find('.split-tile-right:last');

                    var jitsiQuickAddButton = $(
                        '<div class="split-tile-right" style="float:left">' +
                            '<div class="tile-content" ' +
                                 'style="height: 30px; line-height: 30px;position: relative;">' +
                                '<div class="right-actions" ' +
                                     'style="display: inline-block;float: right;margin-right: -16px;">' +
                                    '<div id="jitsi_button_quick_add" ' +
                                         'class="goog-inline-block jfk-button jfk-button-action jfk-button-clear-outline" ' +
                                         'style="left: ' + (numberOfButtons > 1 ? '10' : '0') + 'px;">' +
                                        'Add a ' + LOCATION_TEXT +
                                    '</div>' +
                                '</div>' +
                            '</div>' +
                        '</div>');
                    lastButtonGroup.before(jitsiQuickAddButton);
                    jitsiQuickAddButton.on('click', function(e) {
                        c.scheduleAutoCreateMeeting = true;
                        $('div.edit-button').click();
                    });
                }, 100);
            }
        }).observe(
            body,
            {attributes: false, childList: true, characterData: false});
    }
}

/**
 * Checks whether it is ok to add the button to current page
 * in case of new google calendar interface
 */
function checkAndUpdateCalendarG2() {
    var MutationObserver
        = window.MutationObserver || window.WebKitMutationObserver;
    var c = EventContainer.getInstance();
    if (c) {

        // anyway try to add the button, this is the case when directly going
        // to create event page
        if(document.querySelector('body').dataset.viewfamily === 'EVENT_EDIT'
            && !c.isButtonPresent()) {
            // popup adds autoCreateMeeting param when open directly event
            // create page
            if (findGetParameter('autoCreateMeeting')
                && findGetParameter('extid') === chrome.runtime.id) {
                c.scheduleAutoCreateMeeting = true;
            }

            c.update();
        }

        // Listen for mutations (showing the bubble), for quick adding events
        var body = document.querySelector('body');
        new MutationObserver(function(mutations) {

            // the main calendar view
            if (document.querySelector('body').dataset.viewfamily === 'EVENT') {
                mutations.forEach(function (mutation) {
                    var mel = mutation.addedNodes[0];
                    var newElement = mel && mel.outerHTML;

                    if (newElement
                        && (newElement.search('role=\"dialog\"') !== -1)) {

                        // skip if our button is already added
                        if ($('#jitsi_button_quick_add').length != 0) {
                            return;
                        }

                        var tabEvent = $(mel).find("#tabEvent");
                        if (tabEvent.length > 0) {
                            var jitsiQuickAddButton = $(
                                '<content class="" role="tabpanel" id="jitsi_button_quick_add_content"> \
                                    <div class="LFtY4d">\
                                        <div class="VI7fAf">\
                                            <div class="DPvwYc QusFJf jitsi_quick_add_icon"/>\
                                        </div>\
                                        <div class="mH89We">\
                                            <div role="button" \
                                                 class="O0WRkf zZhnYe e3Duub C0oVfc" \
                                                 id="jitsi_button_quick_add">\
                                                <content class="CwaK9">\
                                                    <span class="RveJvd snByac jitsi_quick_add_text_size">\
                                                        ADD A ' + LOCATION_TEXT + '\
                                                    </span>\
                                                </content>\
                                            </div>\
                                        </div>\
                                    </div>\
                                </content>');

                            $(tabEvent.parent()).append(jitsiQuickAddButton);

                            var clickHandler
                                = jitsiQuickAddButton.find(
                                    '#jitsi_button_quick_add');
                            clickHandler.on('click', function (e) {
                                c.scheduleAutoCreateMeeting = true;
                                $('div[role="button"][jsname="rhPddf"]').click();
                            });

                            return;
                        }
                    }
                });
            } else if (document.querySelector('body').dataset.viewfamily
                === 'EVENT_EDIT') {
                c.update();
            }
        }).observe(
            body, {
                attributes: false,
                childList: true,
                characterData: false,
                subtree : true
            });
    }
}

if (document.querySelector('body').dataset.viewfamily) {
    // this is google calendar new interface
    checkAndUpdateCalendarG2();
} else {
    // google calendar classic or outlook
    checkAndUpdateCalendar();
}

