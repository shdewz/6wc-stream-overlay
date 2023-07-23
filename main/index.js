let mappool, teams;
(async () => {
	$.ajaxSetup({ cache: false });
	mappool = await $.getJSON('../_data/beatmaps.json');
	teams = await $.getJSON('../_data/teams.json');
	let stage = mappool.stage.toUpperCase();
	if (stage) document.getElementById('stage-name').innerHTML = stage;
})();

let socket = new ReconnectingWebSocket('ws://' + location.host + '/ws');

let image_container = document.getElementById('mapimage-container');
let pick_label = document.getElementById('picked-by-label');
let pick_flag = document.getElementById('picked-by-flag');
let title = document.getElementById('title');
let diff = document.getElementById('diff');
let mapper = document.getElementById('mapper');
let len = document.getElementById('len');
let bpm = document.getElementById('bpm');
let sr = document.getElementById('sr');
let cs = document.getElementById('cs');
let ar = document.getElementById('ar');
let od = document.getElementById('od');

let strain_background = document.getElementById('strain-background');
let progressChart = document.getElementById('progress');
let seektime = document.getElementById('map-time');
let strain_container = document.getElementById('strains-container');

let red_name = document.getElementById('red-name');
let red_points = document.getElementById('red-points');
let red_score = document.getElementById('score-red');
let red_flag = document.getElementById('red-flag');

let blue_name = document.getElementById('blue-name');
let blue_points = document.getElementById('blue-points');
let blue_score = document.getElementById('score-blue');
let blue_flag = document.getElementById('blue-flag');

let score_diff = document.getElementById('score-diff');
let lead_bar = document.getElementById('lead-bar');
let chat_container = document.getElementById('chat-container');
let stats_container = document.getElementById('stats-container');
let chat = document.getElementById('chat');
let top_footer = document.getElementById('top-footer');

socket.onopen = () => { console.log('Successfully Connected'); };

let animation = {
	red_score: new CountUp('score-red', 0, 0, 0, .3, { useEasing: true, useGrouping: true, separator: ',', decimal: '.', suffix: '' }),
	blue_score: new CountUp('score-blue', 0, 0, 0, .3, { useEasing: true, useGrouping: true, separator: ',', decimal: '.', suffix: '' }),
	score_diff: new CountUp('score-diff', 0, 0, 0, .3, { useEasing: true, useGrouping: true, separator: ',', decimal: '.', suffix: '' }),
}

socket.onclose = event => {
	console.log('Socket Closed Connection: ', event);
	socket.send('Client Closed!');
};

socket.onerror = error => { console.log('Socket Error: ', error); };

let image, title_, diff_, artist_, replay_, id;
let len_, bpm_, sr_, cs_, ar_, od_, md5;
let strains, seek, fulltime;
let last_strain_update = 0;
let last_score_update = 0;

let chatLen = 0;
let tempClass = 'unknown';

let bestOf, firstTo;
let scoreVisible, starsVisible;
let starsRed, scoreRed, nameRed, flagRed;
let starsBlue, scoreBlue, nameBlue, flagBlue;

let map, mapid;

// picked by label
window.setInterval(async () => {
	await delay(200);
	let cookieName = 'lastPick';
	const match = document.cookie.match(`(?:^|.*)${cookieName}=(.+?)(?:$|[|;].*)`);

	let checkValid = () => {
		if (!mapid) return -9;
		if (match) {
			let cookieValue = match[1].split('-');
			if (cookieValue.length !== 2) return -1;  // expected format: <beatmap_id>-<picking_team>
			const parsedBeatmapID = parseInt(cookieValue[0]);
			if (isNaN(parsedBeatmapID)) return -2;

			// if (true) {  // bypass beatmap id checking during development
			if (mapid == parsedBeatmapID) {
				let map_obj = mappool.beatmaps.find(m => m.beatmap_id == mapid);
				if (map_obj?.identifier?.toUpperCase().includes('TB')) return -3;
				if (flagRed && flagBlue) pick_flag.src = `https://assets.ppy.sh/old-flags/${cookieValue[1] === 'red' ? flagRed : flagBlue}.png`;
				else pick_flag.src = `https://assets.ppy.sh/old-flags/XX.png`;
				pick_label.style.color = cookieValue[1] === 'red' ? '#ff8089' : '#94b6ff';
				pick_label.style.opacity = 1;
				return 0;
			}
			return -255;
		}
	}

	if (checkValid() !== 0) pick_label.style.opacity = 0;
}, 500);

socket.onmessage = async event => {
	let data = JSON.parse(event.data);

	if (mapid != data.menu.bm.id) { await delay(200); mapid = data.menu.bm.id; }

	if (scoreVisible !== data.tourney.manager.bools.scoreVisible) {
		scoreVisible = data.tourney.manager.bools.scoreVisible;

		if (scoreVisible) {
			chat_container.style.opacity = 0;
			top_footer.style.opacity = 1;
			score_diff.style.opacity = 1;
		} else {
			chat_container.style.opacity = 1;
			top_footer.style.opacity = 0;
			score_diff.style.opacity = 0;
		}
	}
	if (starsVisible !== data.tourney.manager.bools.starsVisible) {
		starsVisible = data.tourney.manager.bools.starsVisible;
		if (starsVisible) {
			blue_points.style.opacity = 1;
			red_points.style.opacity = 1;

		} else {
			blue_points.style.opacity = 0;
			red_points.style.opacity = 0;
		}
	}

	// update background image
	if (image !== data.menu.bm.path.full) {
		image = data.menu.bm.path.full;
		data.menu.bm.path.full = data.menu.bm.path.full.replace(/#/g, '%23').replace(/%/g, '%25').replace(/\\/g, '/').replace(/'/g, "\\'");
		image_container.style.backgroundImage = `url('http://${location.host}/Songs/${data.menu.bm.path.full}')`;
		strain_background.style.backgroundImage = `url('http://${location.host}/Songs/${data.menu.bm.path.full}')`;
	}

	// update title
	if (title_ !== `${data.menu.bm.metadata.artist} - ${data.menu.bm.metadata.title}`) {
		title_ = `${data.menu.bm.metadata.artist} - ${data.menu.bm.metadata.title}`;
		title.innerHTML = title_;
	}

	// update diff/mapper
	if (diff_ !== data.menu.bm.metadata.difficulty) {
		diff_ = data.menu.bm.metadata.difficulty;
		diff.innerHTML = `[${diff_}]`;
		mapper.innerHTML = data.menu.bm.metadata.mapper;
	}

	if (mappool && md5 !== data.menu.bm.md5 || len_ !== data.menu.bm.time.full - data.menu.bm.time.firstObj) {
		await delay(200);
		map = mappool ? mappool.beatmaps.find(m => m.beatmap_id == data.menu.bm.id) || { id: data.menu.bm.id, mods: 'NM', identifier: '' } : { mods: 'NM' };
		let mod_ = map.mods || 'NM';
		stats = getModStats(data.menu.bm.stats.CS, data.menu.bm.stats.AR, data.menu.bm.stats.OD, data.menu.bm.stats.BPM.max, mod_);
		let singlestat = mod_ != 'FM';
		// let singlestat = false;

		md5 = data.menu.bm.md5;
		cs.innerHTML = singlestat ? Math.round(stats.cs * 10) / 10 : `${data.menu.bm.stats.CS}<i><svg id="arrow" width="10" height="10" transform="rotate(270)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><defs><style>.cls-1{fill:#fff;}</style></defs><polygon class="cls-1" points="15 40 0 40 15 20 0 0 15 0 30 20 15 40"/></svg>${stats.cs}</i>`;
		ar.innerHTML = singlestat ? Math.round(stats.ar * 10) / 10 : `${data.menu.bm.stats.AR}<i><svg id="arrow" width="10" height="10" transform="rotate(270)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><defs><style>.cls-1{fill:#fff;}</style></defs><polygon class="cls-1" points="15 40 0 40 15 20 0 0 15 0 30 20 15 40"/></svg>${stats.ar}</i>`;
		od.innerHTML = singlestat ? Math.round(stats.od * 10) / 10 : `${data.menu.bm.stats.OD}<i><svg id="arrow" width="10" height="10" transform="rotate(270)" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><defs><style>.cls-1{fill:#fff;}</style></defs><polygon class="cls-1" points="15 40 0 40 15 20 0 0 15 0 30 20 15 40"/></svg>${stats.od}</i>`;
		sr.innerHTML = `${map?.sr || data.menu.bm.stats.fullSR}★`;
		bpm.innerHTML = map?.bpm || Math.round(stats.bpm * 10) / 10;

		len_ = data.menu.bm.time.full - data.menu.bm.time.firstObj;
		let mins = Math.trunc((len_ / stats.speed) / 1000 / 60);
		let secs = Math.trunc((len_ / stats.speed) / 1000 % 60);
		len.innerHTML = `${mins}:${secs.toString().padStart(2, '0')}`;

		if (window.strainGraph) {
			strains = JSON.stringify(data.menu.pp.strains);
			if (!strains) return;

			let temp_strains = smooth(data.menu.pp.strains, 3);
			let new_strains = [];
			for (let i = 0; i < Math.min(temp_strains.length, 400); i++) {
				new_strains.push(temp_strains[Math.floor(i * (temp_strains.length / Math.min(temp_strains.length, 400)))]);
			}

			config.data.datasets[0].data = new_strains;
			config.data.labels = new_strains;
			config.options.scales.y.max = Math.max(...new_strains) * 1.3;
			configProgress.data.datasets[0].data = new_strains;
			configProgress.data.labels = new_strains;
			configProgress.options.scales.y.max = Math.max(...new_strains) * 1.3;
			window.strainGraph.update();
			window.strainGraphProgress.update();
		}
	}

	if (bestOf !== data.tourney.manager.bestOF) {
		let newmax = Math.ceil(data.tourney.manager.bestOF / 2);
		if (bestOf === undefined) {
			for (let i = 1; i <= newmax; i++) {
				let nodeBlue = document.createElement('div');
				let nodeRed = document.createElement('div');
				nodeBlue.className = 'star-b';
				nodeRed.className = 'star-r';
				nodeBlue.id = `blue${i}`;
				nodeRed.id = `red${i}`;
				document.getElementById('blue-points').appendChild(nodeBlue);
				document.getElementById('red-points').appendChild(nodeRed);
			}

		}
		if (bestOf < data.tourney.manager.bestOF) {
			for (let i = firstTo + 1; i <= newmax; i++) {
				let nodeBlue = document.createElement('div');
				let nodeRed = document.createElement('div');
				nodeBlue.className = 'star-b';
				nodeRed.className = 'star-r';
				nodeBlue.id = `blue${i}`;
				nodeRed.id = `red${i}`;
				document.getElementById('blue-points').appendChild(nodeBlue);
				document.getElementById('red-points').appendChild(nodeRed);
			}
		} else {
			for (let i = firstTo; i > newmax; i--) {
				let nodeBlue = document.getElementById('blue' + i.toString());
				let nodeRed = document.getElementById('red' + i.toString());
				document.getElementById('blue-points').removeChild(nodeBlue);
				document.getElementById('red-points').removeChild(nodeRed);
			}
		}
		bestOf = data.tourney.manager.bestOF;
		firstTo = newmax;
	}

	if (starsRed !== data.tourney.manager.stars.left) {
		starsRed = data.tourney.manager.stars.left;
		for (let i = 1; i <= starsRed; i++) {
			document.getElementById(`red${i}`).style.backgroundColor = 'var(--red)';
		}
		for (let i = starsRed + 1; i <= firstTo; i++) {
			document.getElementById(`red${i}`).style.backgroundColor = 'unset';
		}
	}
	if (starsBlue !== data.tourney.manager.stars.right) {
		starsBlue = data.tourney.manager.stars.right;
		for (let i = 1; i <= starsBlue; i++) {
			document.getElementById(`blue${i}`).style.backgroundColor = 'var(--blue)';
		}
		for (let i = starsBlue + 1; i <= firstTo; i++) {
			document.getElementById(`blue${i}`).style.backgroundColor = 'unset';
		}
	}

	if (teams && nameRed !== data.tourney.manager.teamName.left && data.tourney.manager.teamName.left) {
		nameRed = data.tourney.manager.teamName.left || 'Red Team';
		red_name.innerHTML = nameRed;
		let team = teams.find(t => t.name == nameRed);
		flagRed = team?.flag || null;
		if (flagRed) red_flag.src = `https://assets.ppy.sh/old-flags/${flagRed}.png`;
		else red_flag.src = `https://assets.ppy.sh/old-flags/XX.png`;
	}
	if (teams && nameBlue !== data.tourney.manager.teamName.right && data.tourney.manager.teamName.right) {
		nameBlue = data.tourney.manager.teamName.right || 'Blue Team';
		blue_name.innerHTML = nameBlue;
		let team = teams.find(t => t.name == nameBlue);
		flagBlue = team?.flag || null;
		if (flagBlue) blue_flag.src = `https://assets.ppy.sh/old-flags/${flagBlue}.png`;
		else blue_flag.src = `https://assets.ppy.sh/old-flags/XX.png`;
	}

	let now = Date.now();

	if (scoreVisible) {
		let scores = [];
		for (let i = 0; i < 8; i++) {
			let score = data.tourney.ipcClients[i]?.gameplay?.score || 0;
			if (data.tourney.ipcClients[i]?.gameplay?.mods?.str?.toUpperCase().includes('EZ')) score *= 1.8;
			scores.push({ id: i, score });
		}

		scoreRed = 665624;
		scoreBlue = 434765;
		// scoreRed = scores.filter(s => s.id <= 3).map(s => s.score).reduce((a, b) => a + b);
		// scoreBlue = scores.filter(s => s.id >= 4).map(s => s.score).reduce((a, b) => a + b);
		let scorediff = Math.abs(scoreRed - scoreBlue);

		animation.red_score.update(scoreRed);
		animation.blue_score.update(scoreBlue);
		animation.score_diff.update(scorediff);

		if (scoreRed > scoreBlue) {
			red_score.style.fontWeight = '700';
			red_score.style.fontSize = '1em';
			blue_score.style.fontWeight = '500';
			blue_score.style.fontSize = '0.85em';

			if (now - last_score_update > 300) {
				last_score_update = now;
				score_diff.setAttribute('data-before', '◀');
				score_diff.setAttribute('data-after', '');
				score_diff.style.opacity = 1;
				lead_bar.style.width = 360 * (Math.min(0.5, Math.pow((scoreRed - scoreBlue) / 1000000, 0.7)) * 2) + 'px';
				lead_bar.style.right = '960px';
				lead_bar.style.left = 'unset';
				lead_bar.style.borderRight = 'unset';
				lead_bar.style.borderLeft = '10px solid var(--highlight-light)';
			}
		}
		else if (scoreBlue > scoreRed) {
			blue_score.style.fontWeight = '700';
			blue_score.style.fontSize = '1em';
			red_score.style.fontWeight = '500';
			red_score.style.fontSize = '0.85em';

			if (now - last_score_update > 300) {
				last_score_update = now;
				score_diff.setAttribute('data-before', '');
				score_diff.setAttribute('data-after', '▶');
				score_diff.style.opacity = 1;
				lead_bar.style.width = 360 * (Math.min(0.5, Math.pow((scoreBlue - scoreRed) / 1000000, 0.7)) * 2) + 'px';
				lead_bar.style.right = 'unset';
				lead_bar.style.left = '960px';
				lead_bar.style.borderRight = '10px solid var(--highlight-light)';
				lead_bar.style.borderLeft = 'unset';
			}
		}
		else {
			score_diff.setAttribute('data-before', '');
			score_diff.setAttribute('data-after', '');
			score_diff.style.opacity = 0;
			red_score.style.fontWeight = '500';
			red_score.style.fontSize = '0.85em';
			blue_score.style.fontWeight = '700';
			blue_score.style.fontSize = '1em';

			lead_bar.style.width = '0px';
		}
	}

	if (fulltime !== data.menu.bm.time.mp3) { fulltime = data.menu.bm.time.mp3; onepart = 1440 / fulltime; }
	if (seek !== data.menu.bm.time.current && fulltime !== undefined && fulltime != 0 && now - last_strain_update > 100) {
		last_strain_update = now;
		seek = data.menu.bm.time.current;
		if (scoreRed == 0 || scoreBlue == 0) {
			progressChart.style.maskPosition = '-1440px 0px';
			progressChart.style.webkitMaskPosition = '-1440px 0px';
		}
		else {
			let maskPosition = `${-1440 + onepart * seek}px 0px`;
			progressChart.style.maskPosition = maskPosition;
			progressChart.style.webkitMaskPosition = maskPosition;
		}
	}

	if (!scoreVisible) {
		if (chatLen != data.tourney.manager.chat.length) {

			if (chatLen == 0 || (chatLen > 0 && chatLen > data.tourney.manager.chat.length)) { chat.innerHTML = ''; chatLen = 0; }

			for (let i = chatLen; i < data.tourney.manager.chat.length; i++) {
				tempClass = data.tourney.manager.chat[i].team;

				let text = data.tourney.manager.chat[i].messageBody;
				if (data.tourney.manager.chat[i].name == 'BanchoBot' && text.startsWith('Match history')) continue;

				let chatParent = document.createElement('div');
				chatParent.setAttribute('class', 'chat');

				let chatTime = document.createElement('div');
				chatTime.setAttribute('class', 'chatTime');

				let chatName = document.createElement('div');
				chatName.setAttribute('class', 'chatName');

				let chatText = document.createElement('div');
				chatText.setAttribute('class', 'chatText');

				chatTime.innerText = data.tourney.manager.chat[i].time;
				chatName.innerText = data.tourney.manager.chat[i].name + ': \xa0';
				chatText.innerText = text;

				chatName.classList.add(tempClass);

				chatParent.append(chatTime);
				chatParent.append(chatName);
				chatParent.append(chatText);
				chat.append(chatParent);

			}

			chatLen = data.tourney.manager.chat.length;
			chat.scrollTop = chat.scrollHeight;
		}
	}
}

const getModStats = (cs_raw, ar_raw, od_raw, bpm_raw, mods) => {
	mods = mods.replace('NC', 'DT');
	mods = mods.replace('FM', 'HR');

	let speed = mods.includes('DT') ? 1.5 : mods.includes('HT') ? 0.75 : 1;
	let ar = mods.includes('HR') ? ar_raw * 1.4 : mods.includes('EZ') ? ar_raw * 0.5 : ar_raw;

	let ar_ms = Math.max(Math.min(ar <= 5 ? 1800 - 120 * ar : 1200 - 150 * (ar - 5), 1800), 450) / speed;
	ar = ar < 5 ? (1800 - ar_ms) / 120 : 5 + (1200 - ar_ms) / 150;

	let cs = Math.round(Math.min(mods.includes('HR') ? cs_raw * 1.3 : mods.includes('EZ') ? cs_raw * 0.5 : cs_raw, 10) * 10) / 10;

	let od = mods.includes('HR') ? od_raw * 1.4 : mods.includes('EZ') ? od_raw * 0.5 : od_raw;
	od = Math.round(Math.min((79.5 - Math.min(79.5, Math.max(19.5, 79.5 - Math.ceil(6 * od))) / speed) / 6, 11) * 10) / 10;

	return {
		cs: Math.round(cs * 10) / 10,
		ar: Math.round(ar * 10) / 10,
		od: Math.round(od * 10) / 10,
		bpm: Math.round(bpm_raw * speed * 10) / 10,
		speed
	}
}

const delay = async time => new Promise(resolve => setTimeout(resolve, time));

window.onload = function () {
	let ctx = document.getElementById('strains').getContext('2d');
	window.strainGraph = new Chart(ctx, config);

	let ctxProgress = document.getElementById('strainsProgress').getContext('2d');
	window.strainGraphProgress = new Chart(ctxProgress, configProgress);
};

let config = {
	type: 'line',
	data: {
		labels: [],
		datasets: [{
			borderColor: 'rgba(5, 5, 5, 0)',
			backgroundColor: 'rgba(255, 255, 255, 0.15)',
			data: [],
			fill: true,
		}]
	},
	options: {
		tooltips: { enabled: false },
		legend: { display: false, },
		elements: { point: { radius: 0 } },
		responsive: false,
		scales: {
			x: { display: false, },
			y: {
				display: false,
				min: 0,
				max: 100
			}
		},
		animation: { duration: 0 }
	}
}

let configProgress = {
	type: 'line',
	data: {
		labels: [],
		datasets: [{
			borderColor: 'rgba(245, 245, 245, 0)',
			backgroundColor: 'rgba(255, 255, 255, 0.2)',
			data: [],
			fill: true,
		}]
	},
	options: {
		tooltips: { enabled: false },
		legend: { display: false, },
		elements: { point: { radius: 0 } },
		responsive: false,
		scales: {
			x: { display: false, },
			y: {
				display: false,
				min: 0,
				max: 100
			}
		},
		animation: { duration: 0 }
	}
}
