export function civicDate(timestamp){return new Date(timestamp).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Calcutta'});}
export function dueToday(c,timestamp){return c.status!=='Resolved'&&Boolean(c.deadline)&&c.deadline===civicDate(timestamp);}
