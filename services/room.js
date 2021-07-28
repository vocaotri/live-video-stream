class Room {
    constructor(name) {
      this.name = name;
      this.producerTransports = {};
      this.videoProducers = {};
      this.audioProducers = {};
  
      this.consumerTransports = {};
      this.videoConsumerSets = {};
      this.audioConsumerSets = {};
  
      this.router = null;
    }
  
    getProducerTrasnport(id) {
      return this.producerTransports[id];
    }
  
    addProducerTrasport(id, transport) {
      this.producerTransports[id] = transport;
      console.log('room=%s producerTransports count=%d', this.name, Object.keys(this.producerTransports).length);
    }
  
    removeProducerTransport(id) {
      delete this.producerTransports[id];
      console.log('room=%s producerTransports count=%d', this.name, Object.keys(this.producerTransports).length);
    }
  
    getProducer(id, kind) {
      if (kind === 'video') {
        return this.videoProducers[id];
      }
      else if (kind === 'audio') {
        return this.audioProducers[id];
      }
      else {
        console.warn('UNKNOWN producer kind=' + kind);
      }
    }
  
    getRemoteIds(clientId, kind) {
      let remoteIds = [];
      if (kind === 'video') {
        for (const key in this.videoProducers) {
          if (key !== clientId) {
            remoteIds.push(key);
          }
        }
      }
      else if (kind === 'audio') {
        for (const key in this.audioProducers) {
          if (key !== clientId) {
            remoteIds.push(key);
          }
        }
      }
      return remoteIds;
    }
  
    addProducer(id, producer, kind) {
      if (kind === 'video') {
        this.videoProducers[id] = producer;
        console.log('room=%s videoProducers count=%d', this.name, Object.keys(this.videoProducers).length);
      }
      else if (kind === 'audio') {
        this.audioProducers[id] = producer;
        console.log('room=%s videoProducers count=%d', this.name, Object.keys(this.audioProducers).length);
      }
      else {
        console.warn('UNKNOWN producer kind=' + kind);
      }
    }
  
    removeProducer(id, kind) {
      if (kind === 'video') {
        delete this.videoProducers[id];
        console.log('videoProducers count=' + Object.keys(this.videoProducers).length);
      }
      else if (kind === 'audio') {
        delete this.audioProducers[id];
        console.log('audioProducers count=' + Object.keys(this.audioProducers).length);
      }
      else {
        console.warn('UNKNOWN producer kind=' + kind);
      }
    }
  
    getConsumerTrasnport(id) {
      return this.consumerTransports[id];
    }
  
    addConsumerTrasport(id, transport) {
      this.consumerTransports[id] = transport;
      console.log('room=%s add consumerTransports count=%d', this.name, Object.keys(this.consumerTransports).length);
    }
  
    removeConsumerTransport(id) {
      delete this.consumerTransports[id];
      console.log('room=%s remove consumerTransports count=%d', this.name, Object.keys(this.consumerTransports).length);
    }
  
    getConsumerSet(localId, kind) {
      if (kind === 'video') {
        return this.videoConsumerSets[localId];
      }
      else if (kind === 'audio') {
        return this.audioConsumerSets[localId];
      }
      else {
        console.warn('WARN: getConsumerSet() UNKNWON kind=%s', kind);
      }
    }
  
    addConsumerSet(localId, set, kind) {
      if (kind === 'video') {
        this.videoConsumerSets[localId] = set;
      }
      else if (kind === 'audio') {
        this.audioConsumerSets[localId] = set;
      }
      else {
        console.warn('WARN: addConsumerSet() UNKNWON kind=%s', kind);
      }
    }
  
    removeConsumerSetDeep(localId) {
      const videoSet = this.getConsumerSet(localId, 'video');
      delete this.videoConsumerSets[localId];
      if (videoSet) {
        for (const key in videoSet) {
          const consumer = videoSet[key];
          consumer.close();
          delete videoSet[key];
        }
  
        console.log('room=%s removeConsumerSetDeep video consumers count=%d', this.name, Object.keys(videoSet).length);
      }
  
      const audioSet = this.getConsumerSet(localId, 'audio');
      delete this.audioConsumerSets[localId];
      if (audioSet) {
        for (const key in audioSet) {
          const consumer = audioSet[key];
          consumer.close();
          delete audioSet[key];
        }
  
        console.log('room=%s removeConsumerSetDeep audio consumers count=%d', this.name, Object.keys(audioSet).length);
      }
    }
  
    getConsumer(localId, remoteId, kind) {
      const set = this.getConsumerSet(localId, kind);
      if (set) {
        return set[remoteId];
      }
      else {
        return null;
      }
    }
  
  
    addConsumer(localId, remoteId, consumer, kind) {
      const set = this.getConsumerSet(localId, kind);
      if (set) {
        set[remoteId] = consumer;
        console.log('room=%s consumers kind=%s count=%d', this.name, kind, Object.keys(set).length);
      }
      else {
        console.log('room=%s new set for kind=%s, localId=%s', this.name, kind, localId);
        const newSet = {};
        newSet[remoteId] = consumer;
        this.addConsumerSet(localId, newSet, kind);
        console.log('room=%s consumers kind=%s count=%d', this.name, kind, Object.keys(newSet).length);
      }
    }
  
    removeConsumer(localId, remoteId, kind) {
      const set = this.getConsumerSet(localId, kind);
      if (set) {
        delete set[remoteId];
        console.log('room=%s consumers kind=%s count=%d', this.name, kind, Object.keys(set).length);
      }
      else {
        console.log('NO set for room=%s kind=%s, localId=%s', this.name, kind, localId);
      }
    }
  
    // --- static methtod ---
    static staticInit() {
      rooms = {};
    }
  
    static addRoom(room, name) {
      Room.rooms[name] = room;
      console.log('static addRoom. name=%s', room.name);
      //console.log('static addRoom. name=%s, rooms:%O', room.name, room);
    }
  
    static getRoom(name) {
      return Room.rooms[name];
    }
  
    static removeRoom(name) {
      delete Room.rooms[name];
    }
  }