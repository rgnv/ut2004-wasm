// Suspend at the syscall boundary, before FS.read advances stream.position.
addToLibrary({
  fd_read__deps: ['$FS', '$SYSCALLS', '$doReadv', '$Asyncify'],
  fd_read: function(fd, iov, iovcnt, pnum) {
    try {
      if (Asyncify.state === Asyncify.State.Rewinding)
        return Asyncify.handleSleep(function() {});
      var stream = SYSCALLS.getStreamFromFD(fd);
      var finish = function() {
        HEAPU32[pnum >> 2] = doReadv(stream, iov, iovcnt);
        return 0;
      };
      if (stream.node.fetchRange) {
        var length = 0;
        for (var i = 0; i < iovcnt; ++i) length += HEAPU32[(iov + i * 8 + 4) >> 2];
        var pending = stream.node.fetchRange(stream.position, length);
        if (pending) return Asyncify.handleSleep(function(wake) {
          pending.then(function() { wake(finish()); }).catch(function(error) { abort(String(error)); });
        });
      }
      return finish();
    } catch (error) {
      if (error.name !== 'ErrnoError') throw error;
      return error.errno;
    }
  }
});
