

var genes = [
	0.37802293116409913,
	0.9583341309829587,
	2.025907823302328,
	2.0656579754180173,
	3.7164876389086463,
	1.996129400285316,
	0.09158933747506957,
	0.8110295516581401,
	0.38252678281635966,
	2.2508242984491473,
	0.11376696162963498,
	0.08465331505943297,
	0.07544872995816881,
	0.7440678874453605,
	7.229229844667707,
	0.4358619846855732,
	0.2187538124383053
];

var gameData, helpers;
var myHero;
var myTurns = 0;

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
					if(ally && ally.health<=60) target = ally;
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

	
	if(target) return target.dir;
	return "Stay";
}

var predictions = {};
var allHits=0, allMisses=0;

function evaluate(direction) {
	var game = helpers.clone(gameData);
	
	var mover = function(hero, board) {
		if(hero.id===myHero.id) {
			return direction;
		} else {
			return mimic(hero, board);
		}
	}
	
	//simulate a round of turns
	helpers.simulate(game, mover);
	
	predictions[direction] = game.heroes; 
	
	return getTeamScore(game, myHero);
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
	var diamondBonus = genes[3]*(0.25+gameData.turn/800);
	var best, bestValue;
	var first = {};
	for(var i=0; i<targets.length; i++) {
		var target = targets[i];
		var tile = target.tile;
		var value = 0;
		var kind="???";
		if(helpers.isAlly(tile)) {
			kind="ally";
			value = genes[1]*(100-tile.health);
			if(tile.healthGiven>0) value += genes[11]*(100-myHero.health); //treat healers like extra semi-wells. made almost no difference in testing :-/
		} else if(helpers.isEnemy(tile)) {
			kind="enemy";
			value = Math.max(genes[15]*30+genes[2]*(myHero.health-tile.health), 0);
		} else if(helpers.isOtherMine(tile, myHero)) {
			kind="mine";
			value = diamondBonus*Math.max(myHero.health-20, 0);
		} else if(helpers.isWell(tile)) {
			kind="well";
			value = genes[4]*(100-myHero.health);
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
	if(best) {
		scores[best.dir] += genes[10]; 
	}
	
	var avoid = helpers.Inverse[lastMove];
	if(scores.hasOwnProperty(avoid)) scores[avoid]-=5*genes[8];  // bias against reversing our last turn
	
	
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
			startX: h.distanceFromLeft, startY: h.distanceFromTop
		};
	}
	myTurns = 0;
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
	
	
	//remember non-passing moves as "Stay" to avoid getting stuck in dead ends (we resist going backwards)
	lastMove = helpers.passable(helpers.getMoveTile(gameData.board, myHero, best))?"Stay":best;
	
	lastTurn = gameData.turn;
	
	
	return best;
}


module.exports = move;
