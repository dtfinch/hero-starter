var gameData;
var unique = 1;

var Directions = {
	Stay: {x:0,y:0},
	North: {x:0,y:-1},
	South: {x:0,y:1},
	West: {x:-1,y:0},
	East: {x:1,y:0}
};

var Inverse = {
	Stay: "Stay",
	North: "South",
	South: "North",
	West: "East",
	East: "West"
};


function addHealth(hero, amount) {
	hero.health += amount;
	if(hero.health<=0) hero.dead = true; // we don't go as far as the game itself, which would replace the tile with unoccupied/bones
	if(hero.health>100) hero.health = 100;
}

function performMove(board, hero, direction) {
	var y = hero.distanceFromTop;
	var x = hero.distanceFromLeft;
	var d = Directions[direction];
	if(d && direction!=="Stay") {
		var x2=x+d.x, y2=y+d.y;
		var dest = board.tiles[y2] && board.tiles[y2][x2];
		if(dest) {
			if(passable(dest)) {
				//move the hero
				board.tiles[y][x] = {
					type: "Unoccupied",
					distanceFromTop: y,
					distanceFromLeft: x
				}
				board.tiles[y2][x2] = hero;
				hero.distanceFromTop = y2;
				hero.distanceFromLeft = x2;
			} else if(isAlly(dest, hero)) {
				addHealth(dest, 40);
			} else if(isEnemy(dest, hero)) {
				addHealth(dest, -10);
			} else if(isWell(dest)) {
				addHealth(hero, 30);
			} else if(isMine(dest)) {
				if(!dest.owner || dest.owner.id!==hero.id) {
					if(!dest.owner || dest.owner.team!=hero.team) {
						//TODO subtract from previous owner, but for now just avoid rewarding stealing from own team
						hero.mineCount++; 
					}
					addHealth(hero, -20);
					dest.owner = hero;
				}
			}
		} //else out of bounds
	}
	
	//attack surroundings
	if(!hero.dead) { //could have died taking mine
		var neighbors = getAdjacent(hero, board);
		for(var i=0; i<neighbors.length; i++) {
			var tile = neighbors[i];
			if(isEnemy(tile, hero)) {
				addHealth(tile, -20);
			}
		}
	}
	
	
}



//we only track health, not diamonds or other stats yet
function simulate(gameData, mover) {
	var board = gameData.board;
	var heroes = gameData.heroes;
	var startIndex = gameData.heroTurnIndex;
	
	// make sure there's just one copy
	for(var i=0; i<heroes.length; i++) {
		var h = heroes[i];
		if(!h.dead) {
			heroes[i] = board.tiles[h.distanceFromTop][h.distanceFromLeft];
		}
	}
	
	do {
		var hero = heroes[gameData.heroTurnIndex];
		
		if(!hero.dead) {
			var move = mover(hero, board);
			
			performMove(board, hero, move)
			
			
		}
		
		gameData.heroTurnIndex++;
		if(gameData.heroTurnIndex>=heroes.length) gameData.heroTurnIndex=0;
	} while(gameData.heroTurnIndex!=startIndex);
	clearNonsense(gameData);
}

function clearNonsense(game) {
	// clear some of the stuff that interferes with cloning, like pathfinder dirt
	var wh = gameData.board.lengthOfSide;
	var tiles = game.board.tiles;
	for(var y=0; y<wh; y++) {
		for(var x=0; x<wh; x++) {
			var tile = tiles[y][x];
			if(tile.v) delete tile.v;
			if(tile.p) delete tile.p;
			if(tile.distance) delete tile.distance;
			
		}
	}
}

function getMoveTile(board, hero, direction) {
	var y = hero.distanceFromTop;
	var x = hero.distanceFromLeft;
	var d = Directions[direction];
	if(d) {
		var x2=x+d.x, y2=y+d.y;
		return board.tiles[y2] && board.tiles[y2][x2];
	}
}

function validMove(board, hero, direction) {
	if(direction==="Stay") return true; //always valid
	var dest = getMoveTile(board, hero, direction);
	if(!dest) return false;
	//we consider pointless/null moves to be invalid here
	if(dest.type==="DiamondMine" && dest.owner && dest.owner.id===hero.id) return false;
	if(dest.type==="HealthWell" && hero.health===100) return false;
	if(isAlly(dest, hero) && dest.health===100) return false;
	if(dest.type==="Impassable") return false;
	return true;
}

function clone(c) { return JSON.parse(JSON.stringify(c)); }

function shuffle(a) {
	var i = a.length;
	while(i>1) {
		var j = Math.floor(Math.random()*i--);
		var t = a[i];
		a[i] = a[j];
		a[j] = t;
	}
}

function inBounds(x, y) {
	var wh = gameData.board.lengthOfSide;
	return x>=0 && y>=0 && x<wh && y<wh;
}

function getAdjacent(tile, board) {
	var tiles = board.tiles;
	var x = tile.distanceFromLeft;
	var y = tile.distanceFromTop;
	
	var ret=[];
	
	// being silly
	var t;
	y>0 && (t = tiles[y-1][x]) && ret.push(t);
	x+1<board.lengthOfSide && (t = tiles[y][x+1]) && ret.push(t);
	y+1<board.lengthOfSide && (t = tiles[y+1][x]) && ret.push(t);
	x>0 && (t = tiles[y][x-1]) && ret.push(t);
	
	return ret;
}

function getAdjacentFilter(tile, board, filter) {
	var tiles = board.tiles;
	var x = tile.distanceFromLeft;
	var y = tile.distanceFromTop;
	
	var ret=[];
	
	var t;
	y>0 && (t = tiles[y-1][x]) && filter(t) && ret.push(t);
	x+1<board.lengthOfSide && (t = tiles[y][x+1]) && filter(t) && ret.push(t);
	y+1<board.lengthOfSide && (t = tiles[y+1][x]) && filter(t) && ret.push(t);
	x>0 && (t = tiles[y][x-1]) && filter(t) && ret.push(t);
	
	return ret;
}


function grave(tile) {
	return (tile.type==="Hero" && tile.dead) || tile.subType==="Bones" || tile.subType==="RedFainted" || tile.subType==="BlueFainted";
}

function passable(tile) {
	return tile && (tile.type==="Unoccupied" || (tile.type==="Hero" && tile.dead));
}

function hittable(tile) {
	return tile && !passable(tile) && tile.type!=="Impassable";
}

// I'd prefer to be consistent with findNearestObjectDirectionAndDistance if preferGraves is false, hence the reverse loop in pathTrace() and the order of directions in getAdjacent()

function pathTrace(dest, board, preferGraves, source, alternate) {
	var path = [dest];
	var now = dest.v;
	
	var tile = dest;
	while(tile.distance>0) {
		if(preferGraves) {
			var adjacent = getAdjacent(tile, board);
			if(alternate) adjacent.reverse();
			var distance = tile.distance-1;
			tile = undefined;
			for(var i=adjacent.length-1; i>=0; i--) {
				var neighbor = adjacent[i];
				if(neighbor.distance>distance || neighbor.v!==now || (neighbor!==source && !passable(neighbor))) continue;
				
				tile = neighbor;
				if(!preferGraves || grave(tile)) break;
			}
		} else {
			tile = tile.p;
		}
		path.push(tile);
	}
	return path.reverse();
}

function direction(srcTile, destTile) {
	var dy = destTile.distanceFromTop - srcTile.distanceFromTop;
	var dx = destTile.distanceFromLeft - srcTile.distanceFromLeft;
	
	if(dx==0 && dy==0) return "Stay";
	if(Math.abs(dx)>Math.abs(dy)) {
		return (dx<0) ? "West" : "East";
	} else {
		return (dy<0) ? "North" : "South";
	}
}

function pathFind(source, board, preferGraves, filter, limit, maxDist, avoid) {
	var targets = [];
	var now = unique++;
	
	source = board.tiles[source.distanceFromTop][source.distanceFromLeft]; //correct for duplication in gameData
	
	var avoided = [];
	var queue=[source], next=[];
	source.v = now;
	source.distance = 0;
	
	for(;;) {
		var index=0;
		while(index<queue.length) {
			var tile = queue[index++];
			
			if(hittable(tile) && (!filter || filter(tile, source)) && tile!==source) {
				var path = pathTrace(tile, board, preferGraves, source);
				var  target = {
					tile: tile,
					path: path,
					dir: direction(source, path[1]),
					distance: tile.distance
				};
				if(preferGraves) { //todo rename that param
					//look for an equal, but alternate path
					var altPath = pathTrace(tile, board, preferGraves, source, true);
					target.altPath = altPath;
					target.altDir = direction(source, altPath[1]);
				}
				
				targets.push(target);
				if(limit && targets.length>=limit) return targets;
			}
			
			if(passable(tile) || tile===source) {
				var distance = tile.distance+1;
				if(maxDist && distance>maxDist) return targets;
				
				
				var adjacent = getAdjacent(tile, board);
				
				for(var i=0; i<adjacent.length; i++) {
					var neighbor = adjacent[i];
					
					if(neighbor.v===now) continue;
					neighbor.v = now;
					neighbor.distance = distance;
					
					if(!preferGraves) neighbor.p = tile;
					
					if(avoid && avoid(neighbor)) {
						neighbor.distance+=5;
						avoided.push(neighbor);
					} else if(preferGraves && grave(neighbor)) {
						//trick to prefer grave paths
						next.unshift(neighbor);
					} else {
						next.push(neighbor);
					}
				}
			}
		}
		if(next.length==0) {
			if(avoided.length>0) {
				//low quality alternative to using a priority queue for poor paths
				var d=avoided[0].distance;
				do {
					next.push(avoided.shift());
				} while(avoided.length>0 && avoided[0].distance===d);
			} else {
				break;
			}
		}
		queue = next;
		next = [];
	}
	return targets;
}

function findFirst(source, board, filter) {
	return pathFind(source, board, false, filter, 1)[0];
}

function isAlly(other, hero) {
	return other.type==="Hero" && !other.dead && other.team === (hero||gameData.activeHero).team;
}

function isEnemy(other, hero) {
	return other.type==="Hero" && !other.dead && other.team !== (hero||gameData.activeHero).team;
}

function isWeakerEnemy(other, hero) {
	return other.type==="Hero" && !other.dead && other.team !== (hero||gameData.activeHero).team && other.health<hero.health;
}


function isWell(other) {
	return other.type==="HealthWell";
}

function isOtherMine(other, hero) {
	return other.type==="DiamondMine" && (!other.owner || other.owner.team!==hero.team);
}

function isMine(other) {
	return other.type==="DiamondMine";
}


module.exports = {
	setGameData: function(g) { gameData = g; },
	clone: clone,
	shuffle: shuffle,
	inBounds: inBounds,
	getAdjacent: getAdjacent,
	pathFind: pathFind,
	findFirst: findFirst,
	isAlly: isAlly,
	isEnemy: isEnemy,
	isWeakerEnemy: isWeakerEnemy,
	isWell: isWell,
	isOtherMine: isOtherMine,
	Directions: Directions,
	validMove: validMove,
	simulate: simulate,
	Inverse: Inverse,
	getAdjacent: getAdjacent,
	getMoveTile: getMoveTile,
	passable: passable,
	getAdjacentFilter: getAdjacentFilter
};
