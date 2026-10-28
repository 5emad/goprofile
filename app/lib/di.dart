// Composition root: wires data implementations to domain contracts.
import 'core/network/secure_client.dart';
import 'data/api.dart';
import 'data/repositories_impl.dart';
import 'domain/repositories.dart';

class Deps {
  Deps._(this.api, this.auth, this.boards, this.tasks, this.worklogs, this.stats);

  factory Deps.create() {
    final api = Api(SecureClient(), TokenStore());
    return Deps._(
      api,
      AuthRepositoryImpl(api),
      BoardRepositoryImpl(api),
      TaskRepositoryImpl(api),
      WorklogRepositoryImpl(api),
      StatsRepositoryImpl(api),
    );
  }

  final Api api;
  final AuthRepository auth;
  final BoardRepository boards;
  final TaskRepository tasks;
  final WorklogRepository worklogs;
  final StatsRepository stats;
}
