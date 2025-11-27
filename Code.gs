// =====================================================
// SWETA Google Apps Script v3.0.0
// With Push Notification Support
// =====================================================

// =====================================================
// CONFIGURATION - UPDATE THESE!
// =====================================================

// Your Cloudflare Worker URL (after deployment)
const CLOUDFLARE_WORKER_URL = 'https://sweta-push.YOUR-SUBDOMAIN.workers.dev';

// =====================================================
// Web App Entry Points
// =====================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    switch (action) {
      case 'createSheet':
        return jsonResponse(createUserSheet(data.userName));
      case 'logWork':
        return jsonResponse(logWork(data));
      case 'saveSubscription':
        return jsonResponse(saveSubscription(data));
      case 'removeSubscription':
        return jsonResponse(removeSubscription(data.userName));
      case 'getStats':
        return jsonResponse(getStats(data.userName));
      case 'getTasks':
        return jsonResponse(getTasks(data.userName, data.date));
      case 'sendTestPush':
        return jsonResponse(sendTestPush(data));
      case 'startTestMode':
        return jsonResponse(startTestMode(data));
      case 'stopTestMode':
        return jsonResponse(stopTestMode(data));
      default:
        return jsonResponse({ error: 'Unknown action' });
    }
  } catch (error) {
    return jsonResponse({ error: error.message });
  }
}

function doGet(e) {
  const action = e.parameter.action;
  
  if (action === 'triggerNotifications') {
    // Called by external cron or manual trigger
    return jsonResponse(triggerScheduledNotifications());
  }
  
  return jsonResponse({ status: 'SWETA API v3.0.0', message: 'Use POST for actions' });
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// =====================================================
// Sheet Management
// =====================================================

function getOrCreateSheet(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  
  return sheet;
}

function createUserSheet(userName) {
  const sanitizedName = userName.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 30);
  const sheet = getOrCreateSheet(sanitizedName);
  
  // Check if headers exist
  const firstCell = sheet.getRange('A1').getValue();
  if (!firstCell) {
    // Set up headers
    const headers = ['Timestamp', 'Date', 'Time Slot', 'Work Done', 'Duration (min)', 'Logged At'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    
    // Format header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#ff6b9d');
    headerRange.setFontColor('#ffffff');
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
    
    // Set column widths
    sheet.setColumnWidth(1, 180);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 300);
    sheet.setColumnWidth(5, 100);
    sheet.setColumnWidth(6, 100);
  }
  
  return { success: true, sheetName: sanitizedName };
}

// =====================================================
// Work Logging
// =====================================================

function logWork(data) {
  const sanitizedName = data.userName.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 30);
  const sheet = getOrCreateSheet(sanitizedName);
  
  // Check if this is a duration update
  if (data.duration > 0) {
    // Look for the last row with same work and no duration
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const lastRowData = sheet.getRange(lastRow, 1, 1, 6).getValues()[0];
      if (lastRowData[3] === data.workDone && !lastRowData[4]) {
        // Update duration
        sheet.getRange(lastRow, 5).setValue(data.duration);
        return { success: true, updated: true };
      }
    }
  }
  
  // Add new row
  const row = [
    data.timestamp,
    data.date,
    data.timeSlot,
    data.workDone,
    data.duration || '',
    data.loggedAt
  ];
  
  sheet.appendRow(row);
  return { success: true, added: true };
}

// =====================================================
// Push Subscription Management
// =====================================================

function saveSubscription(data) {
  const subsSheet = getOrCreateSheet('_Subscriptions');
  
  // Set up headers if needed
  const firstCell = subsSheet.getRange('A1').getValue();
  if (!firstCell) {
    const headers = ['User Name', 'Subscription', 'Start Time', 'End Time', 'Interval', 'Timezone', 'Updated At'];
    subsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    subsSheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    subsSheet.setFrozenRows(1);
  }
  
  // Check if user already has a subscription
  const dataRange = subsSheet.getDataRange();
  const values = dataRange.getValues();
  let existingRow = -1;
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.userName) {
      existingRow = i + 1;
      break;
    }
  }
  
  const settings = data.settings || {};
  const rowData = [
    data.userName,
    data.subscription,
    settings.startTime || '08:30',
    settings.endTime || '21:30',
    settings.interval || 60,
    settings.timezone || 'Asia/Kolkata',
    new Date().toISOString()
  ];
  
  if (existingRow > 0) {
    subsSheet.getRange(existingRow, 1, 1, rowData.length).setValues([rowData]);
  } else {
    subsSheet.appendRow(rowData);
  }
  
  return { success: true };
}

function removeSubscription(userName) {
  const subsSheet = getOrCreateSheet('_Subscriptions');
  const dataRange = subsSheet.getDataRange();
  const values = dataRange.getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === userName) {
      subsSheet.deleteRow(i + 1);
      return { success: true, removed: true };
    }
  }
  
  return { success: false, message: 'Subscription not found' };
}

function getAllSubscriptions() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const subsSheet = ss.getSheetByName('_Subscriptions');
  
  if (!subsSheet) {
    return [];
  }
  
  const dataRange = subsSheet.getDataRange();
  const values = dataRange.getValues();
  const subscriptions = [];
  
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (row[0] && row[1]) {
      subscriptions.push({
        userName: row[0],
        subscription: row[1],
        startTime: row[2] || '08:30',
        endTime: row[3] || '21:30',
        interval: row[4] || 60,
        timezone: row[5] || 'Asia/Kolkata'
      });
    }
  }
  
  return subscriptions;
}

// =====================================================
// Scheduled Notifications (called by trigger)
// =====================================================

function triggerScheduledNotifications() {
  const subscriptions = getAllSubscriptions();
  const results = [];
  
  for (const sub of subscriptions) {
    try {
      // Check if it's time to send notification for this user
      const shouldSend = shouldSendNotification(sub);
      
      if (shouldSend.send) {
        // Call Cloudflare Worker to send push notification
        const response = sendPushNotification(sub, shouldSend.type, shouldSend.message);
        results.push({ user: sub.userName, type: shouldSend.type, sent: true });
      } else {
        results.push({ user: sub.userName, skipped: true, reason: shouldSend.reason });
      }
    } catch (error) {
      results.push({ user: sub.userName, error: error.message });
    }
  }
  
  return { processed: subscriptions.length, results: results };
}

function shouldSendNotification(sub) {
  // Get current time in user's timezone
  const now = new Date();
  const options = { timeZone: sub.timezone, hour: '2-digit', minute: '2-digit', hour12: false };
  const timeStr = now.toLocaleTimeString('en-US', options);
  const [hours, minutes] = timeStr.split(':').map(Number);
  
  const dayOptions = { timeZone: sub.timezone, weekday: 'short' };
  const day = now.toLocaleDateString('en-US', dayOptions);
  
  // Sunday - only noon message
  if (day === 'Sun') {
    if (hours === 12 && minutes < 15) {
      return { send: true, type: 'sunday', message: 'Happy Sunday! Enjoy your day off! 💜' };
    }
    return { send: false, reason: 'Sunday, not noon' };
  }
  
  // Parse working hours
  const [startHour, startMin] = sub.startTime.split(':').map(Number);
  const [endHour, endMin] = sub.endTime.split(':').map(Number);
  
  const currentMins = hours * 60 + minutes;
  const startMins = startHour * 60 + startMin;
  const endMins = endHour * 60 + endMin;
  
  // Outside working hours
  if (currentMins < startMins || currentMins > endMins) {
    return { send: false, reason: 'Outside working hours' };
  }
  
  // Morning message (within first 15 mins of start time)
  if (currentMins >= startMins && currentMins < startMins + 15) {
    return { send: true, type: 'morning', message: 'Good morning! ☀️ Time to start tracking your day!' };
  }
  
  // Hourly check-in (every interval minutes from start)
  const timeSinceStart = currentMins - startMins;
  const interval = sub.interval || 60;
  
  // Check if we're within 5 minutes of an interval mark
  const intervalMark = Math.floor(timeSinceStart / interval) * interval;
  const nextMark = intervalMark + interval;
  
  if (timeSinceStart >= nextMark - 2 && timeSinceStart <= nextMark + 2) {
    return { send: true, type: 'hourly', message: 'What have you been working on? ⏰' };
  }
  
  // Check for interval alignment (within 5 min window)
  if (timeSinceStart > 0 && timeSinceStart % interval <= 5) {
    return { send: true, type: 'hourly', message: 'Time for a check-in! What did you accomplish? 💜' };
  }
  
  return { send: false, reason: 'Not at interval mark' };
}

function sendPushNotification(sub, type, message) {
  const payload = {
    subscription: JSON.parse(sub.subscription),
    notification: {
      title: type === 'morning' ? 'Good Morning! ☀️' : 'SWETA 💜',
      body: message,
      type: type
    }
  };
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  const response = UrlFetchApp.fetch(CLOUDFLARE_WORKER_URL + '/send', options);
  return JSON.parse(response.getContentText());
}

// =====================================================
// Stats & Reports
// =====================================================

function getStats(userName) {
  const sanitizedName = userName.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 30);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sanitizedName);
  
  if (!sheet) {
    return { todayMinutes: 0, monthlyMinutes: 0 };
  }
  
  const data = sheet.getDataRange().getValues();
  const today = new Date().toLocaleDateString('en-IN');
  const thisMonth = new Date().getMonth();
  const thisYear = new Date().getFullYear();
  
  let todayMinutes = 0;
  let monthlyMinutes = 0;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const duration = parseInt(row[4]) || 0;
    const date = row[1];
    
    // Parse date (DD/MM/YYYY format)
    if (date) {
      const parts = date.split('/');
      if (parts.length === 3) {
        const rowMonth = parseInt(parts[1]) - 1;
        const rowYear = parseInt(parts[2]);
        
        if (date === today) {
          todayMinutes += duration;
        }
        
        if (rowMonth === thisMonth && rowYear === thisYear) {
          monthlyMinutes += duration;
        }
      }
    }
  }
  
  return { todayMinutes, monthlyMinutes };
}

function getTasks(userName, date) {
  const sanitizedName = userName.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 30);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sanitizedName);
  
  if (!sheet) {
    return { tasks: [] };
  }
  
  const data = sheet.getDataRange().getValues();
  const tasks = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[1] === date) {
      tasks.push({
        timeSlot: row[2],
        workDone: row[3],
        duration: row[4]
      });
    }
  }
  
  return { tasks };
}

// =====================================================
// Time-Based Triggers Setup
// =====================================================

function setupHourlyTrigger() {
  // Delete existing triggers first
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'runScheduledCheck') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
  
  // Create new trigger - runs every 15 minutes
  ScriptApp.newTrigger('runScheduledCheck')
    .timeBased()
    .everyMinutes(15)
    .create();
  
  return { success: true, message: 'Trigger created to run every 15 minutes' };
}

function runScheduledCheck() {
  // This function is called by the time-based trigger
  console.log('Running scheduled check at', new Date().toISOString());
  const result = triggerScheduledNotifications();
  console.log('Result:', JSON.stringify(result));
  return result;
}

// =====================================================
// Test Push Notifications
// =====================================================

function sendTestPush(data) {
  const subscription = JSON.parse(data.subscription);
  const testNum = data.testNum || 1;
  const timestamp = data.timestamp || new Date().toLocaleTimeString();
  
  const payload = {
    subscription: subscription,
    notification: {
      title: 'SWETA Test 🧪',
      body: `Test #${testNum} at ${timestamp} - Background push works!`,
      type: 'test'
    }
  };
  
  const options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    const response = UrlFetchApp.fetch(CLOUDFLARE_WORKER_URL + '/send', options);
    const result = JSON.parse(response.getContentText());
    console.log('Test push result:', JSON.stringify(result));
    return { success: true, result: result };
  } catch (error) {
    console.error('Test push error:', error);
    return { success: false, error: error.message };
  }
}

function startTestMode(data) {
  const userName = data.userName;
  const subscription = data.subscription;
  
  // Store test mode state
  const props = PropertiesService.getScriptProperties();
  props.setProperty('testMode_' + userName, JSON.stringify({
    active: true,
    subscription: subscription,
    startedAt: new Date().toISOString(),
    count: 0
  }));
  
  // Create a trigger to send test pushes every minute (minimum GAS allows)
  // First, delete any existing test triggers for this user
  deleteTestTriggers();
  
  // Create new trigger
  ScriptApp.newTrigger('runTestModePush')
    .timeBased()
    .everyMinutes(1)
    .create();
  
  console.log('Test mode started for', userName);
  return { success: true, message: 'Test mode started - pushes every 1 minute from server' };
}

function stopTestMode(data) {
  const userName = data.userName;
  
  // Clear test mode state
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty('testMode_' + userName);
  
  // Delete test triggers
  deleteTestTriggers();
  
  console.log('Test mode stopped for', userName);
  return { success: true, message: 'Test mode stopped' };
}

function deleteTestTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'runTestModePush') {
      ScriptApp.deleteTrigger(trigger);
    }
  }
}

function runTestModePush() {
  // This runs every minute when test mode is active
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  
  let anyActive = false;
  
  for (const key in allProps) {
    if (key.startsWith('testMode_')) {
      const testState = JSON.parse(allProps[key]);
      
      if (testState.active) {
        anyActive = true;
        testState.count++;
        
        const subscription = JSON.parse(testState.subscription);
        const timestamp = new Date().toLocaleTimeString('en-IN', { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit',
          timeZone: 'Asia/Kolkata'
        });
        
        const payload = {
          subscription: subscription,
          notification: {
            title: 'SWETA Test 🧪 (Server)',
            body: `Server push #${testState.count} at ${timestamp} - App is closed but you got this!`,
            type: 'test'
          }
        };
        
        try {
          const options = {
            method: 'POST',
            contentType: 'application/json',
            payload: JSON.stringify(payload),
            muteHttpExceptions: true
          };
          
          UrlFetchApp.fetch(CLOUDFLARE_WORKER_URL + '/send', options);
          console.log('Sent test push #' + testState.count);
          
          // Update count
          props.setProperty(key, JSON.stringify(testState));
        } catch (error) {
          console.error('Failed to send test push:', error);
        }
        
        // Auto-stop after 10 pushes (10 minutes) to prevent runaway
        if (testState.count >= 10) {
          console.log('Auto-stopping test mode after 10 pushes');
          testState.active = false;
          props.setProperty(key, JSON.stringify(testState));
        }
      }
    }
  }
  
  // If no active test modes, delete the trigger
  if (!anyActive) {
    deleteTestTriggers();
  }
}

// =====================================================
// Manual Test Functions
// =====================================================

function testSendNotification() {
  const subscriptions = getAllSubscriptions();
  
  if (subscriptions.length === 0) {
    console.log('No subscriptions found');
    return;
  }
  
  const sub = subscriptions[0];
  console.log('Testing notification for:', sub.userName);
  
  const result = sendPushNotification(sub, 'test', 'This is a test notification from SWETA! 🧪');
  console.log('Result:', JSON.stringify(result));
}

function listSubscriptions() {
  const subs = getAllSubscriptions();
  console.log('Found', subs.length, 'subscriptions:');
  subs.forEach(s => console.log('-', s.userName, s.startTime, '-', s.endTime));
  return subs;
}
