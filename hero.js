
var genes = [
	0.2783691798720658,
	0.6415316080546252,
	2.1456166100676817,
	0.04582335867474455,
	2.9543675658593496,
	2.262991983894942,
	0.13608230613847522,
	0.689573677962253,
	0.03832111312474598,
	4.200686820324058,
	0.3013460394043622,
	0.13767003202420855,
	0.10449113753567647,
	1.3177020005036912,
	8.062119226499334,
	0.1462580990956503,
	0.3258083836515977,
	0.5922408095611413,
	3.701656659246345,
	0.6903431689622259,
	4.394350202097607
];

var gameData, helpers;
var myHero;
var myTurns = 0;
var numReverse = 0;

function getTeamScore(game, hero) { //note that hero is genuine copy, not post-simulation
	var heroes = game.heroes;
	var board = game.board;
	var score=0;
	for(var i=0; i<heroes.length; i++) {
		var h = heroes[i];
		if(!h.dead) {
			var s = h.health;
			if(h.id===hero.id) {
				s += s*genes[12] + 200; //value our life above others
				if(helpers.getAdjacentFilter(h, board, helpers.isWell).length>0) {
					s += Math.min(100-h.health, 30) * genes[13];
				}
				
				var minesTaken = h.mineCount-hero.mineCount;
				if(minesTaken>0 && hero.health-h.health>20*minesTaken) s-=genes[14]; //penalize taking mines while under attack
			}
			s += genes[6]*50 + genes[7]*30*h.mineCount;
			
			score += s * ((h.team===hero.team)?1:-1);
		}
	}
	return score;
}

var dossier;

//tries to classify a hero and guess their next move
function mimic(hero, board) {
	var d = dossier[hero.id];
	
	if(hero.distanceFromLeft!=d.startX || hero.distanceFromTop!=d.startY) d.moved = true;

	var miner = hero.diamondsEarned>0;
	var healer = hero.healthGiven>0;
	if(hero.damageDone%20===10) d.fighter = true; //distinguish direct attacks from indirect
	var fighter = d.fighter;
	var target;
	
	if(!healer && !miner && !fighter && (myTurns<=2 || d.moved) && myTurns<=10) {
		//aggressor is so common, we want to just assume that until we observe better
		fighter = true;
	}
	
	var well = helpers.findFirst(hero, board, helpers.isWell);
	
	var mine = miner && helpers.findFirst(hero, board, helpers.isOtherMine);
	
	if(fighter) {
		var enemy = helpers.findFirst(hero, board, helpers.isEnemy);
		
		//chase weakest of nearest enemies
		if(!healer && !miner) {
			//aggressor mode, the most common fork
			d.type = "aggressor";
			if(hero.health<=30) {
				target = well;
			} else {
				target = enemy;
			}
		} else {
			//assume something wiser
			d.type = "adventurer";
			
			if(well && hero.health<((well.distance===1)?100:50)) {
				target = well;
			} else {
				if(healer) {
					//may heal adjacent allies
					var ally = helpers.findFirst(hero, board, helpers.isAlly);
					if(ally && ally.tile.health<=60) target = ally;
				}
				if(miner && !target) {
					//may chase mine if full health
					if(hero.health===100) target = mine;
				}
				
				if(enemy && (!target || enemy.distance<target.distance)) {
					var weakerEnemy = helpers.findFirst(hero, board, helpers.isWeakerEnemy);
					if(weakerEnemy && weakerEnemy.distance<=enemy.distance) {
						target = weakerEnemy;
					} else {
						target = enemy;
					}
				}
			}
			
			
		}
	} else {
		
		if(healer) {
			//assume priest
			d.type = "priest";
			
			if(well && hero.health<((well.distance===1)?100:60)) { //ugly duplication
				target = well;
			} else {
				target = helpers.findFirst(hero, board, helpers.isAlly);
			}
		} else if(miner) {
			//assume safeDiamondMiner
			d.type = "safeDiamondMiner";
			if(well && hero.health<((well.distance===1)?100:40)) {
				target = well;
			} else {
				target = mine;
			}
		} else if(d.moved) {
			d.type = "survivor";
			if(well) target = well;
		} //else they're probably broken
	}

	
	var dir = "Stay";
	
	if(target) {
		dir = target.dir;
		
		var tile = target.tile;
		if(tile.type==="Hero" && !tile.dead) {
			d.targets[tile.id] = myTurns;
		}
	}
	
	return dir;
}

function evaluate(direction) {
	var game = helpers.clone(gameData);
	var nextHero;
	
	var mover = function(hero, board) {
		if(hero.id===myHero.id) {
			nextHero = hero;
			return direction;
		} else {
			return mimic(hero, board);
		}
	}
	
	//simulate a round of turns
	helpers.simulate(game, mover);
	var score = getTeamScore(game, myHero);
	
	return score;
}

var totalMines=0;

function countMines() {
	totalMines=0;
	var wh = gameData.board.lengthOfSide;
	var tiles = game.board.tiles;
	for(var y=0; y<wh; y++) {
		for(var x=0; x<wh; x++) {
			var tile = tiles[y][x];
			if(tile.type==="DiamondMine") totalMines++
		}
	}
}



var lastMove="Stay";

function evalMoves() {
	var scores = {};
	
	
	/*
		Short range strategy:
		For each direction, we guess how the next round of turns will play out,
		then calculate a team score.
	*/
	for(var dir in helpers.Directions) {
		if(helpers.validMove(gameData.board, myHero, dir)) {
			scores[dir] = evaluate(dir);
			if(dir==="Stay") scores[dir]-=5*genes[0]; // bias against staying in one place
		}
	}

	/*
		Long range strategy:
		Find all reachable targets to offset scores for their respective directions.
	*/
	var targets = helpers.pathFind(myHero, gameData.board, true, function(tile) {
		return helpers.isAlly(tile) || helpers.isEnemy(tile) ||
			helpers.isOtherMine(tile, myHero) || helpers.isWell(tile);
	});
	
	var diamondBonus = genes[3]*0.25 + genes[18]*gameData.turn/800;

	var rage = 1.0;
	if(myHero.team==1 && totalMines==0) rage += genes[20]*gameData.turn/400;
	
	var best, bestValue;
	var first = {};
	var doomBringer;
	var canHeal=false;
	for(var i=0; i<targets.length; i++) {
		var target = targets[i];
		var tile = target.tile;
		var value = 0;
		var kind="???";
		if(helpers.isAlly(tile)) {
			kind="ally";
			value = genes[1]*(100-tile.health);
			if(tile.healthGiven>0) {
				value += genes[11]*(100-myHero.health); //treat healers like extra semi-wells. made almost no difference in testing :-/
				if(tile.distance==1) canHeal = true;
			}
		} else if(helpers.isEnemy(tile)) {
			kind="enemy";
			value = Math.max(genes[15]*30+genes[2]*(myHero.health-tile.health), 0)*rage;
			
			//identify a specific scenario where we have no choice but to fight to the death, and no enemies are nearby, and I am their definite target
			if(target.distance==1) {
				if(!first[kind]) {
					var d=dossier[tile.id];
					//console.log(JSON.stringify(d));
					if(d && d.fighter && d.targets[myHero.id]===myTurns) {
						var maxHits = Math.floor((myHero.health-10)/30);
						if(tile.health<=30+maxHits*30) { //if we even stand a chance
							var justMe = true;
							for(var nt in d.targets) {
								if(+nt!==+myHero.id && d.targets[nt]===myTurns) justMe = false;
							}
							if(justMe) doomBringer=target;
						}
					}
				} else {
					doomBringer=0;
				}
			} else if(target.distance==2) {
				doomBringer=0;
			}
		} else if(helpers.isOtherMine(tile, myHero)) {
			kind="mine";
			value = diamondBonus*Math.max(myHero.health-20, 0);
		} else if(helpers.isWell(tile)) {
			kind="well";
			value = genes[4]*(100-myHero.health);
			if(target.distance==1) canHeal = true;
		}
		
		if(scores.hasOwnProperty(target.dir)) { // skip if validMove() identified the direction as pointless
			var f = first[kind];
			if(!f) { f = first[kind] = tile; }
			var adjustedDistance = target.distance - (f.distance-1)*genes[16]; //discount by nearest so we don't sit in our corner when there are no near targets.
			
			value /= 1+(adjustedDistance-1)*genes[9];
			scores[target.dir] += genes[5]*0.1*value;
			if(!best || value>bestValue) {
				best = target; bestValue = value;
			}
		}
	}
	if(doomBringer && !canHeal && scores.hasOwnProperty(doomBringer.dir)) {
		scores[doomBringer.dir] += genes[19]; 
	}
	
	if(best) {
		scores[best.dir] += genes[10]; 
	}
	
	var avoid = helpers.Inverse[lastMove];
	if(scores.hasOwnProperty(avoid)) scores[avoid]-=5*genes[8]*(1+numReverse*genes[17]);  // bias against reversing our last turn
	
	
	return scores;
}


function newGame() {
	//forget/reset things that we're not supposed to remember between games
	//so that it doesn't skew hero-crucible testing
	
	dossier = [];
	var heroes = gameData.heroes;
	for(var i=0; i<heroes.length; i++) {
		var h = heroes[i];
		dossier[h.id] = {
			type:"", fighter: false,
			startX: h.distanceFromLeft, startY: h.distanceFromTop,
			targets: {}
		};
	}
	myTurns = 0;
	numReverse = 0;
	lastMove = "Stay";
	countMines();
}

var lastTurn = 0;

function move(g, h /*, _genes*/) {
	(helpers = h).setGameData(gameData = g); // :p
	myHero = g.activeHero;
	
	//if(_genes) genes = _genes; //facilitate training
	
	if(!dossier || gameData.turn<lastTurn) newGame();
	
	myTurns++;
	
	var scores = evalMoves();
	var best;
	for(var n in scores) {
		if(!best || scores[n]>scores[best]) best=n;
	}
	
	if(lastMove && best===helpers.Inverse[lastMove]) {
		numReverse++;
	} else {
		numReverse=0;
	}
	
	//remember non-passing moves as "Stay" to avoid getting stuck in dead ends (we resist going backwards)
	lastMove = helpers.passable(helpers.getMoveTile(gameData.board, myHero, best))?"Stay":best;
	
	lastTurn = gameData.turn;
	
	
	return best;
}


module.exports = move;
